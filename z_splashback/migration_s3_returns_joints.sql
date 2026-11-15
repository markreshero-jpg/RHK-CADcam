-- z_splashback S3: returns + joints on a splashback; cut-outs become real cut-out records.
--   returns  [{ end: 'left'|'right', dir: 'back'|'out', length_mm, join: 'mitre'|'butt' }]
--            'back' wraps round a wall end / external corner (e.g. to a door jamb),
--            'out' turns an inside corner toward the room. length_mm = overall (long point).
--   joints   [x mm from the piece's left edge] — vertical slab joints (butt).
--   cutouts  [{ id, kind: 'gpo'|'switch'|'rect'|'round', x, y, w, h, label }] — x / y = bottom-left
--            from the piece's bottom-left; round: w = diameter. (Was an unused polygon list; all rows empty.)
alter table public.splashback_instances
  add column if not exists returns jsonb not null default '[]'::jsonb,
  add column if not exists joints  jsonb not null default '[]'::jsonb;
