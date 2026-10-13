-- Handles H3 — sharknose geometry + finger gap flag. See z_handles/HANDLES-SPEC.md (D3, D4).
-- bevel_depth_mm (H1, never used) becomes bevel_land_mm: the edge thickness left
-- at the front. bevel_angle_deg = the saw blade tilt from vertical.
alter table public.hardware_handles rename column bevel_depth_mm to bevel_land_mm;

insert into public.hardware_handles (name, handle_type, grip_kind, needs_finger_gap, bevel_angle_deg, bevel_land_mm)
select 'Sharknose 45°', 'other', 'sharknose', true, 45, 0
where not exists (select 1 from public.hardware_handles where grip_kind = 'sharknose');
