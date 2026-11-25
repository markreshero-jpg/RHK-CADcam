# Back ↔ full top joint

Status: **built 2026-11-25**, in-app + machine check pending.

## Why

Mark, 2026-11-25 (RHK6563 Study WC-05, and tall cabinets): "isn't showing top
construction holes into the back and they aren't available to click". The seam
list only paired the back with the gables, the bottom and a back top *rail*
(`back:back_rail`). A full top (the wall / tall top type) had no seam to the
back, so nothing was drilled and no edge row showed.

## Locked decisions

1. **Seam key `back:full_top`** (part A `back`, part B `full_top`). Listed
   whenever the cabinet has a back panel and a full top that the back reaches.
   A back stopped short by `BKTOP` gets none.
2. **Inherits `back:bottom`.** With no joint of its own in the method / cabinet,
   the seam falls back to the back ↔ bottom joint (`toGenericSeamKey`), so every
   existing method and cabinet picks the holes up with no data change. The CM
   builder shows the row (Back Panel → Top edge, Top Panel → Back edge) for a
   full-top method; a cabinet can override or suppress it like any seam.
3. **Geometry is read off the parts** (`backTopDrillOps`):
   - top over the back (`TOP_BACK_JOIN sits_over_back`): the `back:bottom` joint
     upside down. The back's top edge is the edge part, the top the face part,
     so part_b holes bore up through the top over the back.
   - top butting into the back: as a back top rail. Part_b holes bore through
     the back where the top lands.
4. **Shaped cabinets**: per-edge backs (`back:<edge>`) under a full top get
   `back:<edge>|full_top` (shaped kind `back_top`), generic key `back:full_top`.
5. **Existing jobs change on their next resolve / nest.** Seam drills are
   regenerated live, so already-drawn full-top cabinets gain the holes the next
   time they are opened or nested. Saved nest runs are not touched.

## Files

`src/lib/resolver/resolveJoints.ts`, `src/lib/resolver/shapedSeams.ts`,
`src/lib/jointDrilling.ts` (`backTopDrillOps`, `backMeetsTop`),
`src/lib/cabinetSeams.ts`, `app/canvas/[roomId]/canvasDB.ts`,
`app/canvas/[roomId]/Cabinet3DView.tsx`. Test: `resolver/__tests__/backTopJoint.test.ts`.
