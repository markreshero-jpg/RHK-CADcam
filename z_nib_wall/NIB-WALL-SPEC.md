# Nib walls

Status: **N1 built 2026-11-02, in-app check pending** (first use: RHK6478 Dune Laundry).
**RESUME HERE** → 2026-11-14 **N4 drop / shaped walls built** (first use: RHK6468 Kitchen curved PB bulkhead
over the kitchen run), in-app check pending. Next: N2 draw tool; drawing an outline by hand (today: automation).

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

## N4 drop / shaped walls (Mark 2026-11-14, RHK6468: "I want it to show in 3D, make sure it's the wall")
- Columns (migration `migration_n4_drop_shaped_walls.sql`, applied live): `walls.base_height numeric`
  (mm above the floor the wall starts, null / 0 = floor) and `walls.outline jsonb` (closed polygon
  `[{x, y}]`, room coords). **Nib walls only** (`wallOutline` / `wallBaseZ` ignore them on other types).
- `pos_x / pos_y / angle / length / thickness` stay as the reference line (e.g. the chord along the host face);
  moving the wall's start moves the outline with it (CanvasClient handleUpdateWall).
- Geometry (`src/lib/geometry.ts`): `wallMitreCorners` returns the outline for a shaped nib (so plan,
  snaps, CAD snap, benchtop editor refs use it); `wallPieces` / `wallSpanQuad` never split a shaped wall
  (no openings). `isDropWall` = shaped or base > 0. `dropWallsOnWall(wall, walls, ref)` = drop nibs in
  front of a face (nearest point within 1500), their stretch along it; `nibsOnWall` skips them.
- **Plan** (canvas + printed): the polygon with the wall fill, **dashed** outline when it's a drop wall;
  name at the outline centroid. **3D**: outline (or rectangle) extruded from base_height to the height;
  no raked top / holes. **Elevation** (canvas + print): a hatched band base_height → height over its
  stretch on the face it stands in front of, with its name. No elevation tab of its own (as nibs).
- Not a side for cabinets (`detectNeighbours` skips drop walls) and not an edge / anchor for tops
  (`wallContacts`, `autoAnchor` skip them).
- Wall panel: Base height (nibs) + "Shaped outline (n points)" with Clear outline. Lesson `drop_wall`.
- Test `src/lib/__tests__/dropWall.test.ts`.

## Phases
| # | What | Status |
|---|---|---|
| N1 | `WallType 'nib'`; geometry (centred rect, excluded from outline/centroid/mitres/returns/nearestWall); `nibsOnWall`; elevation strip (canvas + print); 3D; plan + report names; Wall panel Type "Nib"; draw-plan `type: 'nib'`; test `src/lib/__tests__/nibWall.test.ts` | built, check pending |
| N4 | Drop / shaped nibs: `base_height`, `outline`; plan dashed, 3D from base, elevation band, panel | built 2026-11-14, check pending |
| N2 | Draw tool: snap a nib's start onto a wall face and draw it square off the wall (today, draw a wall and set Type → Nib in the Wall panel) | todo |
| N3 | Decide the nib's treatment in benchtop auto-build, plan dimension chains and cross section (today they treat it like a standard wall) | todo |
