---
name: plumbing-cutouts
description: RHK's standard U-shaped plumbing cut-out in drawer bottoms. Use when asked for plumbing cut-outs, U cut-outs, or waste/trap clearance in vanity or sink drawers, or when a drawer bottom needs notching around pipes.
---

# U-shaped plumbing cut-out (drawer bottoms)

Shop standard from Mark (RHK6586 vanity, 2026-11-08). Built on the part cut-outs system: `z_rangehood/RANGEHOOD-SPEC.md`, R11.

## The standard U

- In the drawer **bottom**, open at the back edge.
- **180 wide**, **210 deep** from the back edge toward the front.
- **R90** on the two corners nearest the drawer front. That makes a round-ended U, because 90 is half the width.
- Centred across the bottom unless the job's pipes say otherwise.

These are the defaults. If the job gives a different size or position, use the job's.

## Which drawers

Ask, or read the plumbing spec and job notes. Normally it's the drawers in the cabinet under the basin or sink, all drawers in the stack that the pipes pass through. Say which ones you assumed.

## How to set it

In the app: Cabinet Edit > the drawer bottom > Cut-outs box > add a notch (tutorial `drawer_plumbing_cutout`).

From a script, merge into `cabinet_instances.part_cutouts` (don't replace what's there). Keys are `db_<row>_<col>_db_bottom`, with row 0 at the bottom of the face grid:

```js
const u = id => ({ id, kind: 'notch', shape: 'rect', w: 180, d: 210, radius: 90, edge: 'back',
  x: { from: 'centre', off: 0 }, y: { from: 'back', off: 0 }, source: 'user' })
part_cutouts = { ...existing, db_0_0_db_bottom: [u('pl1')], db_1_0_db_bottom: [u('pl2')] }
```

It's measured off the bottom's own edges, so it follows the drawer if the cabinet width or runner length changes. Re-resolve the cabinet after saving, then check the saved `outline` on `drawer_box_parts`.

## Known limits

- The **drawer back still runs straight across the U**, so a vertical pipe hits it as the drawer opens. On RHK6586 Mark left this to tweak later. Mention it each time.
- A centre back-to-bottom screw can land in the U.
