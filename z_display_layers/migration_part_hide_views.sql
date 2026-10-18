-- Per-part, per-view hiding (z_display_layers/PART-HIDE-SPEC.md).
-- { "<partId>": ["plan","elevation","3d"] } — a part listed for a view is not
-- drawn in that room view (plan / elevation / 3D + the plan / elevation print
-- reports). Visual only: cut lists, optimiser, CNC and the edit modal ignore it.

alter table cabinet_instances   add column if not exists part_hide_views jsonb not null default '{}'::jsonb;
alter table cabinet_definitions add column if not exists part_hide_views jsonb not null default '{}'::jsonb;
-- Added parts carry their own list so it survives the id change when a library
-- cabinet is placed (definition custom_parts snapshot → new rows).
alter table cabinet_custom_parts add column if not exists hide_views text[] not null default '{}';

-- Old all-views hide list → hidden in every view.
update cabinet_instances ci
set part_hide_views = coalesce((
  select jsonb_object_agg(k, '["plan","elevation","3d"]'::jsonb)
  from jsonb_array_elements_text(ci.hidden_parts) k
), '{}'::jsonb)
where jsonb_typeof(ci.hidden_parts) = 'array' and jsonb_array_length(ci.hidden_parts) > 0;

-- Old custom-part flags → per-view list (none set today; kept for safety).
update cabinet_custom_parts
set hide_views = case
      when not visible or not show_in_room then array['plan','elevation','3d']
      else hide_views end,
    visible = true, show_in_room = true
where not visible or not show_in_room;

comment on column cabinet_instances.hidden_parts is 'DEPRECATED 2026-10-18 — replaced by part_hide_views';
