-- z_CAD_tool A6 — elevation notes belong to one side of their wall (Mark, 2026-10-22:
-- "note should only be shown on the side it's drawn on"). Each wall has a face and a
-- back elevation (e.g. both sides of an island); a note shows on the side it was drawn on.
-- Spec: z_CAD_tool/ANNOTATION-SPEC.md. To apply live as migration `cad_a6_wall_side`.

alter table room_annotations
  add column if not exists wall_side text check (wall_side in ('face', 'back'));

comment on column room_annotations.wall_side is
  'Elevation only: which side of wall_id the note was drawn on (face / back). Matches the canvas elevWallSide.';

-- Elevation rows need a side; plan and sheet rows never have one.
alter table room_annotations drop constraint if exists room_annotations_owner;
alter table room_annotations add constraint room_annotations_owner check (
  (view = 'plan'          and wall_id is null     and cabinet_id is null     and sheet_view is null     and wall_side is null) or
  (view = 'elevation'     and wall_id is not null and cabinet_id is null     and sheet_view is null     and wall_side is not null) or
  (view = 'cabinet_sheet' and wall_id is null     and cabinet_id is not null and sheet_view is not null and wall_side is null)
);
