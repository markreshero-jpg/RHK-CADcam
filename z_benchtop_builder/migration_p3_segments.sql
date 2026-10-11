-- Benchtop Builder Phase 3 — Shape Editor geometry (P-a) + join lines (P-b).
-- Applied as migration `benchtop_p3_segments`.
--
-- segments: Shape Editor segment format, mm, ROOM frame (plan, y-down).
--   [{ type: 'line'|'arc'|'curve', p0, p1, cp1?, cp2?, rx?, ry?, largeArc?, sweep?,
--      edge?: { wall?: bool, profile_id?: uuid|null } }]
--   Source of truth for the outline. polygon / arc_segments / edge_tags are
--   still written (derived) for readers that have not moved yet.
-- joins: straight cut lines across the top, room frame.
--   [{ p0: {x,y}, p1: {x,y}, type: 'butt'|'mitre' }]
--   Replaces join_types (vertex flags), which is no longer written.

alter table benchtop_instances
  add column if not exists segments jsonb not null default '[]'::jsonb,
  add column if not exists joins    jsonb not null default '[]'::jsonb;

-- Backfill: polygon edge i → segment i. A quadratic arc (cpx, cpy) becomes a
-- cubic 'curve' (cp1 = p0 + 2/3(cp − p0), cp2 = p1 + 2/3(cp − p1)).
-- A 'wall' edge tag becomes edge.wall = true.
update benchtop_instances bt
set segments = coalesce((
  select jsonb_agg(seg order by i)
  from (
    select v.i,
      case when a.arc is null then
        jsonb_build_object('type', 'line', 'p0', v.p0, 'p1', v.p1,
          'edge', jsonb_build_object('wall', coalesce(t.is_wall, false)))
      else
        jsonb_build_object('type', 'curve', 'p0', v.p0, 'p1', v.p1,
          'cp1', jsonb_build_object(
            'x', (v.p0->>'x')::float + 2.0/3 * ((a.arc->>'cpx')::float - (v.p0->>'x')::float),
            'y', (v.p0->>'y')::float + 2.0/3 * ((a.arc->>'cpy')::float - (v.p0->>'y')::float)),
          'cp2', jsonb_build_object(
            'x', (v.p1->>'x')::float + 2.0/3 * ((a.arc->>'cpx')::float - (v.p1->>'x')::float),
            'y', (v.p1->>'y')::float + 2.0/3 * ((a.arc->>'cpy')::float - (v.p1->>'y')::float)),
          'edge', jsonb_build_object('wall', coalesce(t.is_wall, false)))
      end as seg
    from (
      select (e.ord - 1)::int as i, e.pt as p0,
             bt.polygon -> (e.ord::int % jsonb_array_length(bt.polygon)) as p1
      from jsonb_array_elements(bt.polygon) with ordinality as e(pt, ord)
    ) v
    left join lateral (
      select true as is_wall from jsonb_array_elements(bt.edge_tags) tg
      where (tg->>'edge_index')::int = v.i and tg->>'type' = 'wall' limit 1
    ) t on true
    left join lateral (
      select ar as arc from jsonb_array_elements(bt.arc_segments) ar
      where (ar->>'edge_index')::int = v.i limit 1
    ) a on true
  ) s
), '[]'::jsonb)
where jsonb_array_length(bt.segments) = 0 and jsonb_array_length(bt.polygon) >= 3;
