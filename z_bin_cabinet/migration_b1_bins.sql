-- z_bin_cabinet B1: bins live in hardware_slides as kind='bin' (spec §4).
-- Seeded INACTIVE: every active-slide query must filter kind='slide' first
-- (B2), otherwise a 620-high bin would win findSlide's "tallest that fits".

alter table hardware_slides
  add column if not exists kind text not null default 'slide',
  add column if not exists inside_width_min numeric,
  add column if not exists inside_width_max numeric;

alter table hardware_slides drop constraint if exists hardware_slides_kind_check;
alter table hardware_slides add constraint hardware_slides_kind_check check (kind in ('slide', 'bin'));

comment on column hardware_slides.kind is 'slide = drawer runner; bin = pull-out bin frame (z_bin_cabinet). Bins: nominal_length = min inside depth, box_height = bin height.';
comment on column hardware_slides.inside_width_min is 'Bins only: narrowest clear width between the mounting gables/divisions.';
comment on column hardware_slides.inside_width_max is 'Bins only: widest clear width between the mounting gables/divisions.';

-- Nikpol Teramo range (TDS May 2026). H = bottom gable row above the cabinet
-- floor (top of the bottom board): 345 / 430 / 510 for 460 / 540 / 620 bins.
with bins(name, module, wmin, wmax, height, h, notes) as (values
  ('Teramo 32L', 300, 262, 280, 620, 510, 'TERAMO-32L, 300 module, 2x16L'),
  ('Teramo 62L', 400, 362, 380, 620, 510, 'TERAMO-62L, 400 module, 2x31L'),
  ('Teramo 56L', 450, 412, 430, 460, 345, 'TERAMO-56L, 450 module, 2x28L'),
  ('Teramo 66L', 450, 412, 430, 540, 430, 'TERAMO-66L, 450 module, 2x33L'),
  ('Teramo 74L', 450, 412, 430, 620, 510, 'TERAMO-74L, 450 module, 2x37L'),
  ('Teramo 94L', 600, 562, 580, 620, 510, 'TERAMO-94L, 600 module, 2x16L + 2x31L')
),
ins as (
  insert into hardware_slides (name, brand, kind, nominal_length, box_height, inside_width_min, inside_width_max,
                               side_deduction, soft_close, full_extension, active, notes)
  select b.name, 'Nikpol', 'bin', 520, b.height, b.wmin, b.wmax, 0, true, true, false, b.notes
  from bins b
  where not exists (select 1 from hardware_slides s where s.name = b.name and s.kind = 'bin')
  returning id, name
)
-- Every hole is a 2mm prick (B-D5). up_off_mm is measured from the cabinet
-- floor for BOTH surfaces (B-D6) — B2's bin path supplies that datum.
insert into drawer_slide_operations (slide_id, operation_order, target_surface, machine_operation,
  tool_diameter_mm, depth_mm, along_off_mm, up_off_mm, qty, spacing_mm, side, repeat_axis, auto_tool, notes)
select ins.id, o.ord, o.surf, 'drill', 5, 2, o.along, b.h + o.dup, o.qty, o.spc, 'both', 'up', true, o.note
from ins
join bins b on b.name = ins.name
cross join (values
  (1, 'cabinet_member',  37.0,    0.0, 2, 95.5, 'front column: H, H+95.5'),
  (2, 'cabinet_member', 261.0,    0.0, 2, 95.5, 'middle column: H, H+95.5'),
  (3, 'cabinet_member', 422.0,    0.0, 1, null, 'rear column: H'),
  (4, 'cabinet_member', 422.0,   89.5, 2, 12.0, 'rear column top pair 12 apart (both pricked until confirmed)'),
  (5, 'drawer_front',    26.0, -216.0, 2, 85.0, 'door bracket slots: H-216, +85; 26 in from the mounting face')
) as o(ord, surf, along, dup, qty, spc, note);
