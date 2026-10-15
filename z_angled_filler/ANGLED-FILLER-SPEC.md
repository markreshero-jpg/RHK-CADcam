# Angled Corner Filler (`BFKANG`) — Spec & Phase Tracker

> **Purpose**: living spec for the dynamic angled corner filler — two mitred face
> fillers in an angled inside wall corner, with an optional support carcass
> behind them. Survives chat wipes — update status lines and decisions in the
> same change as the code.
>
> Builds on the shaped-cabinet system (`z_cabinet_shape/CABINET-SHAPE-SPEC.md`):
> it is a footprint preset (`angled_filler`) on a base cabinet, so carcass, toe
> kick, plan, 3D, benchtop seed and cut list all come from the shaped pipeline.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → A1–A4 checked in-app by Mark (2026-10-15: "looks good"); A5 (back mitre,
> angled-panel drilling, kick spreaders) built same day, uncommitted, awaiting check.

---

## What it is

```
 wall A ────────────────┐ C (wall corner)
   neighbour │ side_a    ╲ back2
   cabinet   │  carcass   ╲      wall B (turns θ = 45° into the room)
   on wall A │  (optional) ╲
             └──fill_a──┐   ╲ side_b
                        P ╲  ╱
                     fill_b ╲╱   neighbour cabinet on wall B
```

Two face filler strips (`fill_a` along wall A's run, `fill_b` along wall B's)
meet in a mitre at the apex P, flush with the neighbouring doors, and stop at
kick height. Behind them sits a doorless support carcass shaped to the corner,
which can be switched off. Cabinets on each wall butt its sides (`side_a` /
`side_b`, each square to its own wall).

## Locked decisions (Mark, 2026-10-15)

1. **Corner** = walls meeting at an inside angle of 180° − θ (θ = how far wall B
   turns into the room). Start with **θ = 45°** (135° corner). θ is a stored
   parameter; placing the filler in a corner sets it from the walls (30° wall →
   θ = 30°).
2. **Faces mitre** at the apex (each bevelled θ/2).
3. **Filler width = the visible face width**, default **40 mm** each side,
   adjustable per side.
4. **Two face strips, each with a return cleat.** The cleats exist when the
   support carcass is **off**; the neighbouring cabinets fix them in. With the
   carcass on, the faces fix to the carcass and there are **no cleats** (confirmed by Mark,
   2026-10-15).
5. **Support carcass**: doorless, full top, bottom, sides (and backs per the
   construction method). Toggled by the cabinet's existing **Carcass** switch
   (`has_carcass`).
6. **Kick** runs under the faces like a normal cabinet, mitred in the corner
   (the shaped kick, z_cabinet_shape decision 13).
7. **Base only** for now.
8. **Both legs take the same depth** = the run's base depth (room → job → shop
   cascade) **at placement**, like every cabinet's depth.
9. **Snaps into the wall corner** when first placed (angle + hand from the two
   walls), then moves freely along its wall.
10. **Code `BFKANG`.**
11. **Benchtop follows** the angled front (z_cabinet_shape 4c seed).
12. **Backs mitre** where they meet, half the corner each (22.5° at 45°) — Mark, 2026-10-15
    after check #1. `ANGLE_JOIN = mitre` on the BFKANG row (`migration_a5_back_mitre.sql`).
13. **Construction holes on the angled panels** like any carcass (Mark, 2026-10-15).

## Design (locked in code)

- **Preset `angled_filler`** (`src/lib/cabinetShape/presets.ts`). Params: `angle`
  (θ, °), `depth` (classDepth), `fill_a`, `fill_b` (visible widths), `cleat`
  (return cleat depth, default 50), and hidden `fo` (face offset = door
  thickness + FACBUF, default 20) and `rev` (neighbour reveal, default 1 = REVL).
  Vertices are formulas of the params only — never `cab.w` / `cab.d` — using the
  new formula functions `sin` / `cos` / `tan` (degrees). The left-hand version
  mirrors about the formula bbox width, not `cab.w`.
  Right-hand frame (x along wall A, y from the wall), T = tan(θ/2):
  carcass facet A length `la = fill_a + rev + fo·T`; P = (la, depth);
  C = (la + depth·T, 0); facet B mirrors about the bisector.
  Edges: `back` (wall A), `back2` (wall B), `side_b`, `fill_b`, `fill_a`, `side_a`.
- **Box follows the shape**: the preset has `boxFromShape` — `presetBox()` gives
  the outline's bbox and every writer of the footprint (placement, Shape section,
  corner snap) sets `dx` / `dz` to it. Resizing such a cabinet by its box is not
  meaningful (the shape ignores it).
- **Filler edges** carry `edge.filler = { width, cleat }` (segments are the
  source of truth, z_cabinet_shape decision 8). `resolveShapedFaces`:
  - a filler facet always resolves as one **false panel** (any face grid ignored);
  - two filler facets at a concave corner **mitre** with no gap: rev =
    tan(φ/2)·mid-offset, bevel = −φ/2 (**negative bevel = front face shorter**;
    `zoneBlank` lists the longer back face);
  - the face's front width is exactly `filler.width`: the outer end's reveal
    floats to absorb any difference between the nominal `fo` / `rev` and the
    real door thickness / reveal.
  - Layer item: the false panels show under **False panels**; cleats under **Fillers**.
- **Cleats** (`resolveFillerCleats`): carcass off → per filler facet, at its end
  against a side edge, a `cleat:<edge>` face-kind panel in the side edge's plane
  (outer face on the outline, thickness inward), from the filler's back face back
  by `filler.cleat`, the filler's height, carcass material. DB:
  `case_parts_part_key_check` widened (`migration_a2_cleat_key.sql`).
- **Corner snap** (`src/lib/cabinetShape/angledFillerSnap.ts`): on placement the
  wall end nearer the drop point, the wall joined there, θ and hand from the two
  walls' directions in the cabinet frame, then pos so C sits on the corner.
  Moves along the wall clamp on the **wall span** — the part of the outline on
  the wall face (`cabWallSpan`) — so the B leg may stand past the wall's end.

## Phases

- [x] **A1** — formula trig; preset + `presetBox`; filler edges; concave false-panel
      mitre; exact visible width; negative-bevel blank; tests (`angledFiller.test.ts`)
- [x] **A2** — cleats when the carcass is off; part key + layer + label; DB constraint (applied)
- [x] **A3** — corner snap at placement + auto angle/hand; drag clamps on the wall span; Shape-section
      edits keep the wall corner in place (`keepCorner`) and resize the box (tests `angledFillerSnap.test.ts`)
- [x] **A4** — library row `BFKANG` (`migration_a4_bfkang_library.sql`, applied; subcategory Fillers,
      construction from B2D), cabinet-codes skill; benchtop seed test (decision 11)
- [x] In-app check #1 (Mark, 2026-10-15: "looks good") → A5
- [x] **A5** (2026-10-15) — after check #1:
      - backs mitred (decision 12; rule on the row + the two placed fillers);
      - **drilling on angled panels** (shapedSeams / jointDrilling): `panelTurn` gives the exact angle for a
        panel that isn't square to the cabinet (from its long faces, so bevelled ends don't skew it); a
        part meeting it needs `contactSpan` (an edge on its face) and, if a panel, `runsAlongX` (end-on —
        angled butts / the back mitre stay hand-fixed). Holes lay along the contact edge. A horizontal
        bore into an unturned part's edge that isn't square to its sheet (bottom / top along a 45° side)
        is dropped — the side's face holes stay. Seams: bottom / full_top / back2 → side_b, back2 → bottom.
        Applies to every shaped cabinet with an angled panel (angled end, trapezoid…), not just BFKANG.
      - **kick spreaders** (resolveShapedKick `lineInterval`): was a convex half-plane cut — the far
        facet's line clipped the end spreaders short at the front. Now even–odd crossings on any polygon,
        lines nudged 0.01 off the outline. Spreaders run kick back → sub front (492 at 580 deep).
      - Tests `angledFillerSeams.test.ts` (mitre + no overlap, seam set, every hole enters + bores into its
        part for screw + dowel joints, no angled edge bores, spreader length).
- [ ] In-app check #2 (Mark)

## Known gaps

- rhk-crm's code parser doesn't know `BFKANG` yet (only this repo's cabinet-codes skill is updated).
- Changing the Shape section's hand (Left/Right) on a placed filler doesn't re-snap it — re-place it instead.

- θ outside 5°–90° warns (a reflex or very shallow corner isn't modelled).
- A joined kick run still gets its straight kick through the filler (z_cabinet_shape
  4b gap). The filler's own kick is mitred.
- The placement ghost shows the plain box until drop; the snap happens on drop.
- Elevation shows the turned faces at their bounding width (z_cabinet_shape Phase 5).
- CabinetPanel position fields / elevation drags still clamp on `dx` (plan drags use the wall span).
- Mitred edges get the false panel's normal edge banding (same as mitred doors).
- Dowel / cam joints into the bottom / top along the angled side lose their edge bore (can't be
  machined square on a flat-bed CNC); the side's face holes remain — hand-fix or screw there.
- The back mitre (and any angled butt) has no drilling — hand-fixed.
