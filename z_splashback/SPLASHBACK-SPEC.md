# Splashback module — Spec & Phase Tracker

> **Purpose**: the living spec for splashbacks. Update status + decisions in the same change as the code.
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → 2026-11-14 spec written from Mark's brief (RHK6468 Mossman Crt). **Nothing built.**
> The decisions marked **PROPOSED** wait for Mark's OK. First job: RHK6468 Kitchen (ST marble on the
> kitchen run with a mitred return to the door jamb, RS reconstituted stone in the butler's pantry).

## Mark's brief (2026-11-14)

- "Work like benchtops do": draw it, Edit shape, etc.
- **Its own material schedules**: splashbacks are often glass (or tile, mirror…) on a stone bench, so they
  can't follow the benchtop's stone schedule.
- Was "Deferred: Splashback module" in `z_benchtop_builder/BENCHTOP-SPEC.md`.

## What a splashback is (PROPOSED)

A flat panel standing **in a wall's plane**, on the face side, sitting on a benchtop (or the floor / a
cabinet), drawn and edited in **elevation** the way a benchtop is drawn and edited in plan.

- Belongs to one wall + side (`wall_id`, `wall_side` face/back), like an anchored benchtop. One splashback
  per wall run; corners meet with a joint (butt / mitre), same rule as [benchtops one per wall].
- Outline = Shape Editor segments in the **wall's elevation frame** (x along the wall from its start, y up from
  the floor). Default rectangle: bench top → underside of the overheads / rangehood / bulkhead.
- Thickness from its material (20 stone, 6 glass, 12 ply-backed tile…), sitting on the wall face (or set off it
  by `offset_mm` for a packer / batten).
- **Returns**: an edge can turn the corner as a return piece (E2 on RHK6468: "mitre stone around wall to the
  door jamb") — `edge.return = { length_mm, join: 'mitre' | 'butt' }`, drawn on the adjacent face.
- **Cut-outs**: rectangles / rounded rects for GPOs, switches, windows sills, rangehood, tap / pot filler.
  Openings (windows / doors) in the wall cut it automatically, with an editable reveal (default 0).

## Data (PROPOSED)

- `splashback_instances` — `room_id, label, wall_id, wall_side, segments (Shape Editor, elevation frame),
  cutouts, edges (per segment: exposed / wall / joint / return, profile_id, edgeband / polish), offset_mm,
  splashback_schedule_id, build_method_id, notes`.
- `splashback_schedules` + `splashback_schedule_rows` (role → material), seeded: 20mm Stone, 12mm Stone,
  6mm Toughened Glass (colour-backed), Tile (by others), Mirror 6mm, Acrylic / compact laminate.
- Materials: reuse `benchtop_materials` (stone / timber already there) + new `material_type`s `glass`,
  `tile`, `mirror`, `acrylic`; **or** a separate `splashback_materials` — **Mark to pick** (Q2).
- Job / room / instance cascade like benchtops: `job_splashback_materials`, `room_splashback_materials`.

## Drawing (PROPOSED)

- **Elevation**: outline + fill pattern per material type (stone hatch, glass diagonals, tile grid); label
  "SPLASHBACK - <material>"; cut-outs; joints. Editable here (drag edges, Edit shape, add cut-out).
- **Plan**: thin band on the wall face (dashed under overheads); returns shown.
- **3D**: extruded panel, material colour, glass slightly transparent.
- **Auto-build**: per wall, from the benchtop's wall edges up to the lowest of: overheads' underside,
  rangehood, bulkhead, room height − soffit; across the benchtop's length; stops at talls / windows.

## Outputs (PROPOSED)

- Benchtop Quote report gets a Splashbacks section (m², cut-outs count, polished edges, returns, joins) per
  material — stone + splashback on one sheet for the stonemason; glass on its own list.
- Not CNC'd (stone / glass by others).

## Questions for Mark

1. Auto-build splashbacks from the tops (like Auto-build tops), or draw each by hand first?
2. Materials: extend the benchtop material library with glass / tile / mirror types, or a separate
   splashback material library?
3. Window sills: splashback stops at the window, or the stone wraps the sill / reveal?
4. Default height when there are no overheads (e.g. a kitchen run under a bulkhead, RHK6468): to the
   bulkhead underside, or a set height (e.g. 600 / 700)?
5. Should a stone splashback be able to be the **same piece** as the benchtop's material by default
   (inherit when the job schedule says so), with glass etc. as overrides?

## Phases

| Phase | What | Status |
|---|---|---|
| S0 | Spec + Mark's answers | [~] spec written 2026-11-14, answers pending |
| S1 | Tables + schedules + seed materials | [ ] |
| S2 | Draw / edit in elevation (rect + Edit shape), plan band, 3D | [ ] |
| S3 | Returns, joints, cut-outs (+ auto from openings) | [ ] |
| S4 | Auto-build from tops | [ ] |
| S5 | Benchtop Quote section | [ ] |
| S6 | Tutorial lesson | [ ] |

## First job: RHK6468 Kitchen (drawn once S2 lands)

- Kitchen run (Wall 7): ST 20 SNB Arabescato honed, bench 920 to the PB bulkhead (700), full 3872, mitred return
  at the north end to the door jamb (Elevation 2).
- Butler's north + west (Walls 4 + 3): RS reconstituted stone, colour TBC, bench to the lift-up underside 1620
  (700). South (Wall 2): window W8 920-1620, no splashback under it.
