# Faced doors (mirror doors) — spec

Status: **F1–F4 built 2026-11-01** (RHK6478 Bath Linen), in-app check pending.

## What it is

A door blank whose CNC'd board gets a bought-in facing stuck on its front:
the first one is **16.5 Whiteboard + 4mm mirror** (Mark, 2026-11-01: "door type
will usually be 16mm whiteboard and have a 4mm mirror cut to the same size and
stuck on the face of it").

## Locked decisions (Mark, 2026-11-01)

1. **A door type, not a one-off** — the facing lives on the **door blank**
   (`door_catalogue`), so any style built on that blank is a faced door.
2. The **board is cut on our CNC as normal** (16.5 Whiteboard, the colour
   range's linked board). The **facing is bought in** (glazier), cut to the
   same size as the door — it is never nested.
3. Front thickness for every size rule = **board + facing** (16.5 + 4 = 20.5):
   front assembly = door + 2 buffer, so a 600 OA cupboard = 577.5 carcass.
4. Facing size = the door's finished size (same W × H).

## Data

- `door_catalogue.facing_name text` (e.g. `4mm Mirror`) and
  `door_catalogue.facing_thickness_mm numeric` — both null = an ordinary blank.
- `face_zones.facing jsonb` — resolved `{ name, thickness_mm }` per front
  (persisted like `door_profile`).
- Migration: `z_faced_doors/migration_f1_facing.sql` (applied 2026-11-01).

## Resolver

- `ResolvedDoorStyleInput.facing` from the blank (loadCabinetInput door loader).
- `t.door` (job/room door thickness) includes the facing.
- Face zone: `DZ` = board thickness (what gets cut); `facing` = the layer in
  front of it. Zone Z (back of the board) is unchanged, so the facing sits at
  `Z + DZ` and the front assembly is `DZ + facing + buffer` deep.

## Outputs

- **3D**: the facing is drawn as a 4mm mirror slab on the face of the door (F3).
- **Optimiser**: the board part's comment reads
  `4mm MIRROR FACED - stick on after (bought in, same size)` (F4).
- **Reports → Glass Order**: faced fronts are listed with the glass doors,
  Type = the facing name (4mm Mirror), size = the door's size (F4).
- **Library → Doors → Blanks**: "Facing (bought in)" name + thickness fields.
- Seeded 2026-11-01: blank "16mm Whiteboard + 4mm Mirror" (16.5 + 4), colour
  range "Mirror Door" (colour linked to Whiteboard 16.5mm, White STP 21x1 tape),
  style "Mirror Door". Tutorial "Mirror doors (faced doors)".

## Phases

- F1 data + migration + library Blanks fields (facing name / thickness) — built
- F2 resolver + persist + t.door — built
- F3 3D mirror slab — built
- F4 optimiser comment + Glass Order lines — built
- F5 elevation mirror hatch, label picture — later
