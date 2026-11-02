# Nib walls

Status: **N1 built 2026-11-02, in-app check pending** (first use: RHK6478 Dune Laundry).

## Why
Mark, 2026-11-02 (RHK6478 Laundry): a basin vanity sits in a recess beside the laundry
talls, behind a short dividing wall. He wants a "wall divider ... basically a nib wall" so
the talls, the divider and the vanity all show on **one elevation**, as the Cabinet Vision
markup draws it ("sides built in"). Today a room is only its outline walls, and each wall
gets its own elevation.

## Locked decisions (Mark, 2026-11-02)
- A nib is a wall with `wall_type = 'nib'`. There's no new table or column, and `walls.wall_type`
  has no check constraint.
- It's **90 thick** by default (`thickness`). Height is the room height unless `height` is set.
- **Geometry:** `pos_x / pos_y` is its start, on the main wall's inside face. `angle` points
  into the room and `length` is how far it sticks out. The nib is a plain rectangle **centred
  on its line**, with square ends and no mitres.
- **Not part of the room outline.** These skip nibs:
  - `centroid()` and `chainInwardNormals`.
  - The mitre joins, both the main walls' joins and the nib's own.
  - The return-wall finders: elevation canvas, elevation print, and `returnWallsOf`.
  - The elevation wall tabs.
  - `nearestWall`: cabinets go on the main wall beside a nib, never on the nib.
- **Elevation:** `nibsOnWall(wall, walls)` finds the nibs whose end sits on the wall's
  inside face, within 10. Each shows on that wall's face elevation as a hatched cut strip at
  its centre, with its name. It is drawn on the canvas (`ElevationSVG`) and the print
  (`ElevationPrintSVG`).
- **Cabinets:** a cabinet butted against a nib reads it as a **wall** (`detectNeighbours`
  probes the wall polygons), so the wall rules for fillers, scribes and reveals apply.
- **Display layers:** uses the existing `walls` / `wall_fill` / `wall_names` items. There is no new
  registry item.
- **draw-plan:** a layout wall with `"type": "nib"` is skipped by the clockwise check. Put
  nibs **last** in the `walls` list so the outline walls stay consecutive.

## Phases
| # | What | Status |
|---|---|---|
| N1 | `WallType 'nib'`; geometry (centred rect, excluded from outline/centroid/mitres/returns/nearestWall); `nibsOnWall`; elevation strip (canvas + print); 3D; plan + report names; Wall panel Type "Nib"; draw-plan `type: 'nib'`; test `src/lib/__tests__/nibWall.test.ts` | built, check pending |
| N2 | Draw tool: snap a nib's start onto a wall face and draw it square off the wall (today, draw a wall and set Type → Nib in the Wall panel) | todo |
| N3 | Decide the nib's treatment in benchtop auto-build, plan dimension chains and cross section (today they treat it like a standard wall) | todo |
