# Curved Fixed-Panel Cabinet (`?CRVFIXP`): spec and phase tracker

> **Purpose**: this is the living spec for the native curved-end cabinet. A face board wraps the front, a
> 90° curve and the side, and it bends because its back is pocketed down to a thin skin across
> the curve. It is shaped to horizontal formers. Its rules come from the shop-proven "Vanity Curved
> End" web tool (`z_curved_end/kit/`: `SPEC.md` + `reference/curved_end_core.mjs`).
> Keep the status lines and decisions in this file up to date in the same change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → C3 built 2026-10-20 (`migration_c3_curved_end_joints.sql` applied). **In-app check
> pending (Mark)**: Library → Joints shows the four `CRV …` joints; Construction methods → Curved ends
> shows their defaults; on a placed curved end, 3D drilling (Machining layer) shows the holes, a part’s
> edge joints list its seams, and the optimiser G-code has the Ø5 through-holes plus one bend pocket per
> curve on the face board (10 mm bit, 6 mm past top and bottom). Then C4 (rib cut-out route).

---

## What it is

The cabinet is a closed carcass with no doors. It is built from these parts (kit SPEC §1):

- **Face board**: one continuous board. It wraps front → curve → side, or for the double version
  side → curve → front → curve → side. A back-face pocket across each curve leaves a thin skin so
  the board bends. All of its other faces stay full thickness.
- **Fixing panel**: single ends only. It is the vertical panel on the neighbour side, and it screws
  the cabinet to its neighbour.
- **Back**.
- **Formers**: Top, Bottom and Rib1…n. These are horizontal plates shaped to the inside of the face
  board. The ribs can have an optional lightening cut-out.
- **Fixing blocks** (optional): carcass strips behind the face board's straights, notched into the formers.

## Locked decisions (Mark, 2026-10-20)

1. **Cut natively on our own CNC.** There is no DXF / S2M export. Every part goes through the cut list,
   costing and Panel Optimiser → G-code, like any drawn cabinet.
2. **A cabinet of its own**, placed like any other. It is not tied to vanities: it is used as base,
   wall and tall.
3. **One library entry per class**:
   - Base: `BCRVFIXP`
   - Wall: `WCRVFIXP`
   - Tall: `TCRVFIXP`
   - The hand is a **dropdown in the RHS bar** (L / R / Both). The displayed code gets the
     shape-modifier suffix `/L`, `/R` or `/2` (shape decision 6). The double version keeps the `CRVFIXP` name.
4. **Mounting**: the cabinet usually sits on the floor. Sometimes it sits at kick height with a **curved
   kick that follows the curve**. Benchtops follow the shape plus the overhang from the handle spec
   (shape decision 16). The **double** version is a closed carcass.
5. **Shop materials.** The face board and carcass boards come from the room/job/shop material cascade,
   so `FT` and `T` are the real board thicknesses. As much as possible is built from existing native
   mechanisms.
6. **Port, don't wrap.** The kit's rules are re-implemented in our own resolver:
   - parts are normal resolved parts
   - holes are normal drill ops
   - the pocket is a normal route/pocket op
   - former shapes are outlines with true arcs

   The kit's `fixtures/` (expected.json numbers and golden DXFs) are kept only as **test oracles**:
   unit tests compare our part sizes, outlines and hole positions, in part-local coordinates, against
   them to 0.01 mm. The kit's geometry rules are not changed.
7. **Cut list, costing and optimiser**: every part goes through them.
8. **Face board grain is vertical by default** (grain along the height). A per-cabinet option makes
   it horizontal (along the wrap).
9. **Drawings**:
   - Plan shows the curved outline.
   - Elevation is a box for now; a curve in elevation can come later.
   - Shop drawing sheets treat it as just another cabinet. Nothing special is needed.
10. **Skin (material left in the pocket)**:
    - variable, default **2 mm**
    - warn **below 2** (too thin)
    - warn **above 3** (too hard to bend)
    - pocket depth = `FT − SK`
11. **Face board material** = the end panel / exterior material.
12. **A face board longer than the sheet allows** (e.g. vertical grain with the wrap longer than the
    sheet's cross-grain width) gets a **panel joint**, chosen by the user:
    - **Side joint(s)**: on the flat side(s), only if each piece still reaches over the face and
      clears the radius pocket.
    - **Face joint**: at the centre of the front.
    - **No joint**: the user cuts and joins the board by hand, and it goes back on the machine as one
      piece to be routed. *This needs work*: it is a part bigger than a sheet blank, cut on its own.
13. **Pocket overrun**: past the top and bottom edges by at least **tool radius + 1 mm**, for a clean
    square cut-out. The part spacing must be more than the tool radius. The pocket tool is most likely
    a 10 mm bit (5 mm radius). The current part spacing is believed to be about 12–14 mm; check this in
    C3 and warn if spacing ≤ the overrun.
14. **Curved kick** = the same skin-pocket bend on the kick board (*needs work*, C5).
16. **Face board edging** (Mark, 2026-10-20): the top and bottom edges are **not** taped. The **gable
    end that butts into the next cabinet is** taped (exposed edgeband). Single ends only. The wall end
    is not taped (it is scribed or trimmed). With a gable overhang the end is trimmed after glue-up, so
    it is left raw.
17. **Rib count is editable** (Mark, 2026-10-20: "number of internal supports editable"). The default is
    **Auto** (the kit's gap rule). A typed count sets the ribs between the top and bottom, evenly
    pitched. Fewer than the rule allows gives a warning (the face board may flex). Too many to fit
    blocks the CNC.
18. The kit lives in `z_curved_end/kit/`. Its README prompt and DXF checker refer to the old S2M
    workflow; only the rules and fixtures are used here.

## Geometry rules

The rules are the kit's `SPEC.md` §2–§5 and §7, unchanged. These points are adapted for RHK:

- The kit's `W/D/H` = the cabinet's DX / DZ / DY (width / depth / height). `R` = the curve radius
  parameter.
- The kit's plan frame (x across, d from the front) maps to the cabinet frame (x from the left,
  +Z toward the front).
- Hands: RH = curve on the right. LH mirrors the **3D placement only**. As in the kit, the face board,
  fixing panel, back and blocks are the same part for either hand, and the formers are handed outlines.
- Overhangs and scribes (`OG`, `OL/OR`, `SBK`, `SBT`, `STP`) are per-cabinet parameters.
- The kit's validation warnings are cabinet errors (they block CNC). Its notes are cabinet warnings.

## Built in C2 (2026-10-20)

- **Data**: `cabinet_definitions.curved_end` / `cabinet_instances.curved_end` jsonb
  (`src/lib/curvedEnd/settings.ts`: hand RH / LH / DOUBLE, R, SK, OG, OL, OR, SBK, SBT, STP, lighten,
  B, onion, OS, blkS, blkF, grain). `case_parts.wrap` jsonb. Part keys `^crv:[a-z0-9_]+$`.
- **Library**: `BCRVFIXP` 300 × 900 × 580, `WCRVFIXP` 300 × 700 × 350, `TCRVFIXP` 300 × 2100 × 580,
  each under its class's **End Panels** category. No carcass / internals / face / kick flags. Height and
  depth cascade like the class.
- **Placement**: `buildInstanceFromDefinition` copies `curved_end` and builds the plan `footprint` from
  it. The internal presets `curved_end` (sided) and `curved_end_double` are hidden from the Shape
  section. Roles: back = back; the face board's front and curve = `front`; the straight it wraps back
  along and the neighbour side = `side`. Changing the hand or radius rewrites the footprint.
- **Resolver**: `resolveCurvedEnd.ts`. `shapeCaseParts` is skipped for curved ends, because the
  footprint is only the plan outline. Kit warnings → errors `CURVED_END`; kit notes and skin limits →
  warnings `CURVED_END_NOTE`. Face board = `exposed_material` (decision 11); all else = the carcass
  board. Part keys:
  - `crv:face`
  - `crv:fix`
  - `crv:back`
  - `crv:bottom` / `crv:top` / `crv:rib_<n>`
  - `crv:blk_side` (`_l` / `_r`) / `crv:blk_front`
- **Face board**:
  - DX × DY is the flat blank, with DY along the grain. Vertical (default) = DY is the height;
    horizontal = DY is the wrap length (decision 8).
  - `grain_direction` is set to match.
  - `wrap` = its bent plan outline (cabinet frame, bulges) + height.
  - `caseBox` / `casePlanCorners` / elevation / 3D (extruded up as a shape) all draw from `wrap`.
- **Other parts**:
  - Uprights (fixing panel, back, blocks) are face-kind turned panels (`isCurvedEndUprightKey`).
  - Formers are horizontal, with the kit outline.
  - No edge banding (the kit has none).
- **UI**: `CurvedEndSection.tsx` in the cabinet panel. Header shows `BCRVFIXP/R` etc. Sections (plus a Ribs count with an Auto tick, decision 17):
  - curve hand, face grain
  - radius, skin
  - overhangs, scribes
  - blocks
  - rib cut-outs
  - a live summary plus the kit warnings
- **Layers**: one new item, `curved_ends` (group panels, all views, on by default).
- **Not yet (later phases)**:
  - the pocket and holes (C3)
  - rib cut-outs as parts (C4)
  - kick / benchtop (C5)
  - the face-board-longer-than-sheet panel joint (decision 12)
  - ~~face board edge banding~~ → decision 16 (gable end only), built 2026-10-20
  - a code suffix anywhere other than the sidebar header (the label stays B1, B2, …)

## Built in C3 (2026-10-20)

- **Declared seams**:
  - `resolveCurvedEnd.curvedEndSeams` declares every join as `DeclaredSeam` (part A = screwed into,
    part B = drilled through), with the kit's join lines (SPEC §5).
  - The resolver passes them to `resolveJoints`. The cascade is: per-cabinet `carcase_joints[seam]` →
    the exact key → the generic key.
  - Generic keys: `crv_fix:former`, `crv_back:former`, `crv_fix:back`, `crv_block:face`,
    `crv_block:former`.
  - Seam keys are `<partA>|<partB>`, e.g. `crv:rib_1|crv:fix`.
- **Drilling**:
  - `jointDrilling.declaredSeamDrillOps` lays each op along the declared line.
  - Part B is bored through from its inner face, which is the face its CNC frame puts up, so each panel
    machines on one face.
  - The holes flow through `seamDrillsFor` → `cabinetSeamDrills` → `seamDrillSync` (part_operations)
    and the 3D Machining layer, like every joint.
  - New formula variable **`CW`** = the contact width (A's thickness, or the block width face-to-face).
- **Skip-near** (general joint option): `joint_type_operations.skip_near_mm`, the "Skip ≤" column in
  Library → Joints. An op's holes give way to another op's holes within that distance on the same part
  (`dropNearDrills`). The kit uses 20 for the block face screws.
- **Library joints** (seeded; `src/lib/curvedEnd/joints.ts` is the source; the migration is checked by a
  test): `CRV screw 50/250`, `CRV screw 40/250`, `CRV block face screw`, `CRV block end screw`. They are
  the defaults on every construction-method schedule row. Construction methods → Joint Defaults →
  "Curved ends" edits them. Per cabinet, a part's edge joints list its curved-end seams.
- **Proof**: every kit fixture goes through `resolveCabinet` → `collectDrillRows`, and each part's holes
  equal the kit's to 0.01 mm. The LH fixing panel reads mirrored, because it is the same part turned
  over (kit §1). A 1-rib case proves the skip-near drop.
- **Bend pocket**:
  - Built by `seamDrillSync.collectCurvedPocketRoutes`: one generated route pocket per curve on the
    face board's back face, depth FT − SK.
  - It runs the full height plus **cutter radius + 1 = 6 mm** past the top and bottom (decision 13).
  - It uses the finger-rail notch cutter (the active 10 mm bit). Without one it is skipped and logged.
  - The positions are stored on the part as `wrap.bend` (from the gable end; DOUBLE from the left wall
    end). The axis follows the grain.
- **Not yet**:
  - the pocket drawn in 3D
  - a nest check that the overrun clears the neighbouring part (the gap is ~14 vs a 6 overrun today)
  - the cabinet edit modal's Joints tab (box seams only); the part's edge joints cover it

## Mapping onto the native pipeline (proposed)

| Kit item | Native home |
|---|---|
| Inputs (R, SK, hand, overhangs, scribes, blocks, lighten, onion) | `cabinet_instances.curved_end` jsonb, defaulted from `cabinet_definitions.curved_end`. Bulkhead precedent: `src/lib/bulkhead.ts` + `resolveBulkhead.ts` |
| Plan outline / neighbours / benchtop / kick | a `footprint` from a new preset, so plan, benchtop decision 16 and the shaped kick reuse the existing code. The face board edges get a role that means "wrapped by the face board" (instead of raising `SHAPE_CURVED_PANEL`) |
| `calc()` | `src/lib/resolver/resolveCurvedEnd.ts` (pure), which emits `crv:*` case parts registered in `cabinetShape/partKeys.ts` |
| Former outlines (arcs, block notches) | `ResolvedPart.outline` with bulges → `case_parts.outline` → existing nest true shapes and G2/G3 contours |
| Face board pocket | generated route `pocket` op on the back face (routes already run on the material-up pass) |
| Ø5 through-holes | joints library on generator-declared seams → `seam_joint` drill ops (see Open) |
| Rib cut-out (inner closed loop, optional onion skin) | **new**: an inner-loop route with its own depth. Today only `cut_holes` exists, and it only cuts through with a sheet-wide onion skin |
| 3D | formers/back/panel as existing extrudes. The face board is drawn as its plan wrap outline, extruded up to full height (as in the kit's page), with pocket lines shown. It is cut as a flat blank |

## Phases (proposed)

- [x] **C0** Spec (this file)
- [x] **C1** (2026-10-20) Geometry engine in TS (`src/lib/curvedEnd/`) plus tests against all 10 kit fixtures
  (numbers, outlines and holes vs the golden DXFs)
- [x] **C2** (built 2026-10-20, checked in-app by Mark 2026-10-20) Library entries + placement + hand + RHS-bar
  parameters, footprint preset, resolver hook, shop materials, 3D
- [~] **C3** (built 2026-10-20, in-app check pending) Operations: pocket + drill ops generated and persisted, reaching the optimiser/G-code; cut
  list and costing; grain option
- [ ] **C4** Rib cut-out: inner-loop route with per-op depth (onion skin) in the optimiser/G-code
- [ ] **C5** Curved kick + benchtop follow (on kick-height placement)
- [ ] **C6** Tutorial; elevation curve (later, if wanted)

## Open

- **Holes via the joints library** (Mark, 2026-10-20: "can we apply our intelli joints … new joints
  that suit what the rules are … all native and editable"). **LOCKED 2026-10-20 (Mark OK’d):**
  - The generator **declares its seams explicitly**. It knows exactly which parts meet, so there is no
    geometric discovery. The seams are:
    - `crv:fix|former` (one per former)
    - `crv:back|former`
    - `crv:fix|back`
    - `crv:block|face` (block → face board)
    - `crv:block|former`
  - Each seam has a generic key. That way the construction method's `joint_defaults` and the
    per-cabinet `carcase_joints` override work through the existing JointsPanel / PartEdgeJoints UI.
  - The drilling goes through `seamDrillOps` → `seam_joint` part_operations, like any box seam.
  - New library joints are seeded to reproduce the kit:
    - **"CRV screw 50/250"**: Ø5 through, 50 in from each end, ≤ 250 pitch, even spread, centred on
      the mating part's thickness.
    - **"CRV screw 40/250"**: the same for the back into the formers.
    - **Block face** and **block end** joints.
    - The rules are written as joint `expressions`.
  - Gaps to close:
    - (a) generator-declared seams. Today seams are only the fixed box list or found from `roleOf`
      geometry (`shapedSeams.ts`).
    - (b) qty = 1 → one centred hole. Today the spacing formula divides by zero.
    - (c) a min-gap hole dedupe (the kit drops a block face hole within 20 of a former hole). No such
      rule exists yet.
  - Test: the seeded default joints must reproduce every kit fixture's holes to 0.01 mm.
  - Part spacing is checked: the gap is per material = router Ø + `nest_pad` (2) + entry offset (2),
    so about 14 mm with a 10 mm bit (`optimiser/types.ts` `buildMargins`).

### Answered 2026-10-20 (kept for history)

1. **Hand:** a dropdown in the RHS bar (L / R / Both) with one library entry per class, or separate
   library entries? Proposal: a dropdown, with the displayed code getting the usual shape-modifier
   suffix (`BCRVFIXP/L`, `/R`, `/2`), per shape decision 6. Is `CRVFIXP` right for the double one
   too, since it has no fixing panel?
2. **Hole rules** (→ joints library, see top of Open): should the kit's spacing (50 inset, 40 for the back, 250 max pitch, Ø5 through,
   blocks 100/60) become editable construction rules (`r.*`), or be fixed constants in the generator
   for now?
3. **Face board material:** which material slot? Proposal: the finished end-panel/exterior material.
4. **Vertical grain:** the face board's flat width is the wrap length, which is 1951 mm in kit case 08.
   A vertical-grain board longer than the sheet's cross-grain width (1200) can't nest. Should that
   block with an error, or switch to horizontal with a warning?
5. **Pocket overrun:** the kit's pocket runs 8 mm past the top and bottom edges. In a nested sheet that
   overrun would cut into the neighbouring part. Proposal: run the pocket to the part edge plus tool
   clearance, and keep it inside the part spacing. Did the S2M jobs nest the face board, or cut it on
   its own?
6. **Curved kick:** how is it made? Is it the same pocket-bend on a kick board, or something else?
7. **Kit folder:** move `z_curved_end/kit/` to `z_curved_end/kit/`?
