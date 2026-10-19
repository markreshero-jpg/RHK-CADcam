# WOT — wall oven tower as a kit of cabinets

Status: **spec'd 2026-10-19**, nothing built yet. Supersedes the single-carcass
`WOT` in `z_ubo/UBO-SPEC.md` (WOT section), which the user rejected: a tower has
**no gables**. Touches the library drilling gap found the same day (phase K0).

## Locked decisions (user, 2026-10-19)

1. **Built from end panels, not a carcass.** `TEPK` either side (default; `TEPF`
   is the alternative), running to the room/job **tall height**. **600 clear**
   between the panels.
2. **Drawers below = a `D2-LL`** between the panels, 650 high overall (kick
   included), **full top** (no rails). The oven sits straight on its top.
3. **Oven cleats:** two vertical cleats, **600 high × 80**, internal board, on
   the inside faces of the panels, standing on the D2-LL top. Front face **20
   back from the TEP front edge**. Two **5 mm through** fixing holes each,
   **50 from the top and bottom ends, centred on the 80**. Edged on the 600
   (front) edge, with a part comment **"edge in black"**.
4. **Option 1 — open microwave box:** an **exposed** shelf, **450 deep**, sits on
   top of the oven cleats, front **flush with the TEPs**, no fixing holes (angle
   brackets on site). An **exposed back panel** runs up behind it. Clear opening
   **350–400** (default 380), then the W2D.
5. **Option 2 — integrated microwave / combi / steam oven:** a shelf sits on the
   oven cleats, **internal board, set back 20 in line with the cleats** (the
   appliance fascia covers it), edged on the 600 edge, comment "edge in black".
6. **W2D above:** **400 deep + doors**, **outset off the back wall** so its doors
   finish flush with the TEP fronts. **Bottom scribe** = the exposed under
   panel's thickness (16.5 or 18 by the material cascade) with an **exposed
   under panel** fitted underneath. Top at the tall height.
7. **Drop the whole set** from one library pick: panels, D2-LL, oven core,
   W2D. **Separate cabinets** for now (each its own parts / nest / cost); one
   undo step. No grouping (move/delete as one) yet.
8. **Fix library drilling first** (K0) — hand-drawn part operations on custom
   parts must travel with the library entry and copy/paste.

## Current code (survey 2026-10-19)

- **Drilling is per placed cabinet only.** `part_operations` rows are keyed by
  `source_cabinet_id` + `source_part_key` (`custom_<id>` for custom parts).
  `dbCopyCabinetChildren` (`canvasDB.ts:534`) copies custom parts, hides,
  No-CNC and shape overrides but **not ops**; Save to library drops them; a
  definition has nowhere to keep them. 0 of 8,268 op rows sit on a custom part.
  `part_comments` / `part_labels` have the same gap. Not flagged in any spec.
- **No cabinet grouping.** Only kick runs link cabinets. Group paste
  (`pasteGroupAt`) is the model for inserting several under one snapshot.
- **No wall offset.** `pos_x/pos_y` = back-left corner from `wallAnchorPoint`
  (always on the wall face); dragging re-anchors.
- **Bottom scribe exists:** `SCRBT` raises the whole carcass (sides + bottom)
  while doors still run from the cabinet base — the gap is where the under
  panel goes. **`SCRBK` is not an offset** (it holds the top forward; sides
  still run to the wall).
- Wall-unit bottom = `wallCabTop − dy` (soffit / `rooms.wall_cabinet_top` /
  2100); base/tall sit at `pos_z`.

## Geometry (tall depth D, door t_d, exposed t_e, internal t_i)

TEP depth = D + t_d + 2 → front plane F = D + t_d + 2 from the wall.
Width = 600 + 2·t_e. Heights off the floor:

| Part | Where |
|---|---|
| D2-LL | 0 → 650, full top |
| Oven cleats | 650 → 1250, front at F − 20, 80 deep, t_i thick, against each TEP |
| Opt 1 shelf | 1250 → 1250 + t_e, 600 × 450, front at F |
| Opt 1 back panel | 1250 → W2D bottom, behind the shelf (front face at F − 450) |
| Opt 1 opening | 380 clear above the shelf |
| W2D | bottom = 1250 + t_e + 380, top = tall height; `SCRBT` = t_e; under panel 0 → t_e, runs back to the back panel |
| Opt 2 shelf | 1250 → 1250 + t_i, front at F − 20 |

## Phases

**K0 — library drilling + comments on custom parts.** Definition snapshot of a
custom part carries its hand-drawn ops (and comment). Save to library writes
them; placement (`dbInsertDefinitionParts`) and copy/paste
(`dbCopyCabinetChildren`) re-create them on the new part ids. Test + check: drill
a custom part, save to library, place, paste — holes on every copy.
✅ **Built 2026-10-19**, in-app check pending. `src/lib/libraryPartData.ts`
(pure key mapping, test `libraryPartData.test.ts`); definition columns
`part_operations` / `part_comments` / `part_labels`
(`z_wot/migration_k0_library_part_data.sql`, applied). Hand ops on standard parts
travel too (stable keys); generated rows don't (seamDrillSync rebuilds them).
Still not carried: undo/redo of a deleted cabinet (snapshot holds the instance
row only — existing gap).

**K1 — wall gap.** `cabinet_instances.wall_gap` (mm, default 0): the cabinet's
back sits that far off the wall face. `wallAnchorPoint` callers add it; drag
keeps it; Cabinet panel field "Off wall". Plan / elevation / 3D follow `pos`.

**K2 — D2-LL** library entry (two equal drawers) — needed by the kit, useful on
its own.

**K3 — kit placement.** `cabinet_definitions.kit` jsonb: members (definition,
x / y / dx / dy / dz / wall_gap as numbers or formulas over `t.*`, `r.*`,
`tall.h`, `tall.d`) + per-member top type, rule overrides, extra custom parts.
Placing a kit drops every member under one snapshot (like group paste).

**K4 — WOT kit.** Oven core definition (no carcass: cleats + option-1 shelf +
back panel, oven content), D2-LL, W2D with under panel + `SCRBT`, TEPKs.
Retire the single-carcass `WOT` (inactive). Option 2 entry. Tests on the
layout at 16.5 / 18 exposed and 140 / 150 kick.

**K5 — tutorial** (place a WOT, switch TEPK→TEPF, change opening).

## Open

- Option 2 code — not given yet (skill: don't invent codes).
- Option 2: assumed the combi gets its own cleats like the oven (≈450 high) and
  the W2D sits straight on top. Confirm.
- `SCRBT` is set from the exposed thickness at placement; a later material
  change doesn't re-sync it.
- W2D top uses the wall-cabinet top line, the panels the tall height — fine
  while both are 2100; warn if they differ.
