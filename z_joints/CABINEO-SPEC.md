# Lamello Cabineo 12 — concealed joint

Status: **C1 built 2026-10-30** (engine + joint types + tutorial), in-app check pending.

Source: `Lamello/Lamello Cabineo 12.png` + Lamello's machining files
(`Cabineo-12th_machining-stp.zip` / `-dxf.zip`; the DXFs are ACIS solids, the
STEP files were read for the numbers below).

## Machining (from the STEP files)

Part A = the panel whose edge butts in (bottom, top, back…), Part B = the panel
it butts into (gable).

| | |
|---|---|
| Pocket (A face) | 3 × Ø15 circles in a row going in from the edge, centres **3.6 / 14.8 / 26.0** from the edge. The first breaks out of the edge (13.2 opening). Router ≥ Ø10. |
| Collar on surface | depth **11** ← used |
| Collar flush | depth 11.5 + Ø16.7 × 0.8 recess at 26.0 (not used) |
| Cover cap flush | depth 13 + Ø18.8 × 2.05 recess at 26.25 (not used) |
| Screw hole (B face) | **Ø5 × 12**, axis **5** below the pocket face |

## Locked decisions (Mark, 2026-10-30)

1. **Collar on surface** only.
2. **No construction method uses it yet.** It is picked per joint on a cabinet
   (Joints tab), as a swap for **5mm Dynamic Holes** — concealed joints on an
   exposed end, a back, etc. A construction method can default to it later.
3. **Spacing = 5mm Dynamic Holes**: first set 50 in from each end, ≤ 280 apart
   (`qty = Math.ceil((D - 100) / 280) + 1`), so swapping doesn't move anything.
4. **Pocket on either face**: two joint types, `Lamello Cabineo 12 - inside`
   and `- outside`.

## How it's built (C1)

- **Joint faces `inside` / `outside`** (part_a ops, `JointFace`): the face of A
  toward / away from B's middle — a bottom's top, a top's underside, a back's
  front. Resolved per seam in `seamDrillOps` (gable seams, horizontal or upright
  part A). `offset_x` = distance in from the seam edge; the 2nd axis fans along it.
  Other seam shapes (back:bottom, back rail, divider ends, declared, bank) skip
  these faces.
- **Expression var `IN`** = 1 when A's inside face is the face offset_y is measured
  from (top / front), else 0. The B screw hole uses `IN ? 5 : CW - 5` (inside)
  and `IN ? CW - 5 : 5` (outside).
- **`stopped` op flag** (new column `joint_type_operations.stopped`): a part_b
  face hole keeps its depth instead of boring through. Library editor: **Stop** tick.
- **Pocket = one drill op**: Ø15 × 11, offset_x 14.8, qty2 3 @ 11.2 → 3.6 / 14.8 / 26.0.
  No Ø15 drill on the head, so the optimiser pocket-routes each circle
  (`resolveDrillTools` router fallback).
- Migration + seed: `migration_c1_cabineo.sql` (applied 2026-10-30).
- Test: `src/lib/resolver/__tests__/cabineoJoint.test.ts`.
- Tutorial: `cabineo` (Intermediate ▸ Cabinets).

## Phases

| | | |
|---|---|---|
| C1 | Engine (inside/outside, IN, stopped) + 2 joint types + tutorial | built 2026-10-30 |
| C2 | In-app check: swap a bottom / back joint, look at 3D + Edge joints, run the optimiser on it | pending |
| C3 | Nest check: the first circle runs 3.9 past the part edge, 11 deep — must land in the part gap (no bounds check in the optimiser). Check the router pick (≥ Ø10) + the warnings | pending |
| C4 | Hardware: Cabineo 12 in the hardware library (takeoff / costing), 3D model | after C2 |
| C5 | Optional: back:bottom seam support, construction-method default | when needed |
