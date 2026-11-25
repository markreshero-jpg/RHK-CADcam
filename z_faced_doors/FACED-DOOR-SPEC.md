# Faced doors (mirror doors) — spec

Status: **F1–F4 built 2026-11-01** (RHK6478 Bath Linen), in-app check pending.
**F6 inset mirror door built 2026-11-25** (RHK6583), in-app check pending.

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
- F5 elevation mirror hatch, label picture — later (the inset mirror's mark is in F6)
- F6 inset mirror door (routed from the back) — built 2026-11-25, in-app check pending

## F6 — Inset mirror door (Mark 2026-11-25, RHK6583 Piggott)

A 2pac frame door with a mirror set into a rebate **routed from the back**, the
opening cut through so the mirror shows from the front. Mark: "we'll do these often",
and it must live in the door library (native, editable), not as CAD outlines.

Locked decisions
1. **Same machining as the glass door** (z_cnc_tools T2/T3): rebate band, squared
   corners, opening cut through, all from the back. It is a glass recipe whose pane
   is a mirror, not a faced blank (F1–F4 is a mirror stuck on the face).
2. **Fixing = silicone only.** Nothing else is cut or ordered.
3. **Everything is library data, nothing hard coded.** Mark's question: "are these
   numbers editable?" Yes:
   - rebate width / depth, squared corners, through cut: Settings → CNC Tool Sets →
     **Mirror Door** steps (started as a copy of Glass Door: 15.9 x 6.35; **8 x 6 with
     the 8mm Downshear T110 since F7**)
   - pane thickness (4), clearance (1.5), **Pane type** (`4mm Mirror`): the same set
   - frame (60 all round, per-edge offsets): Library → Doors → Profiles → **Mirror inset**
   - style **Mirror inset — 2pac** = Glass — 2pac's blank + colour range with that profile.
     One door can take the profile on any style (Face Grid → Profile).
4. `cnc_tool_sets.glass_type` = the pane type (null = Glass). It names the Glass
   Order line and makes 3D / elevation draw a mirror.

Code
- Migration `z_faced_doors/migration_f6_mirror_inset.sql` (applied 2026-11-25):
  column + seeded set, profile, style.
- Loader joins the op's tool set → `RawProfileOp.pane {type, thickness_mm}` →
  `ResolvedProfileOp.pane` (persisted in `face_zones.door_profile`).
- `doorPaneRects` (`src/lib/doorProfile.ts`): opening = door − the op's frame offsets.
- 3D: the pane is drawn in the opening (mirror = metal, glass = clear blue).
  Elevations / shop drawings: three diagonal strokes in a mirror opening
  (`doorProfileSvg`).
- Glass Order Type = the set's pane type. Test `src/lib/takeoff/__tests__/mirrorInset.test.ts`.
- Tutorial `mirror_inset`.
## F7 — Rebate 8 x 6, 8mm Downshear (Mark 2026-11-25)

Glass Door + Mirror Door tool sets, data only (`migration_f7_rebate_8x6.sql`, applied
2026-11-25), machine check pending:
1. rebate band **8 wide x 6 deep**, T110 8mm Downshear, one lap, outward from the opening line
2. corners squared with the 6mm (R4 to R3)
3. opening cut **right through** with the 10mm compression (the middle drops out).
   It follows the machine profile's **Onion skin** like the part perimeters: a lap to
   thickness − skin, then a lap through (`emitRoutes`, any through outline step).

The profile row (Library → Doors → Profiles) only places the opening line (frame
offsets); its "pocket" type and depth cut nothing once a tool set is picked. The tool
set's steps are what the machine runs. Pane = opening + 16 − 2 × clearance.

- Fronts resolved before F6 have no `pane` until they are re-resolved (open + save the
  cabinet). The Glass Order reads the tool set, so it is right straight away.
