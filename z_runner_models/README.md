# Runner models — brief for a parametric generator

**Goal:** one script per runner family (first: DTC Dragon Pro) that draws the runner
for ANY length and height, like `z_bin_cabinet/build_bin.py` does for bins. Claude
ports it into the app (`src/lib/…Geometry.ts`), so one generator replaces a GLB per
size. The script is the reference, not something the app runs.

## What we have today (the three GLBs in this folder)

`DTC_DragonPro_{95,127,178}x500.glb` (trimesh, **mm**, one mesh `RunnerBody`, no
materials) are all the same 16-point cross-section, extruded 0 → 500 in Z. Only the
top of the tall wall changes (= box height). Front-face profile (x, y), mm:

```
(22,H) (22,29) (41,29) (41,28) (37.5,28) (37.5,11.5) (54.5,11.5) (54.5,10.5)
(34.5,10.5) (34.5,20.5) (26.5,20.5) (26.5,28) (10,28) (10,0) (9,0) (9,H)
```

H = 95 / 127 / 178. X runs 9 → 54.5 (in from the gable face). The rows place them
with anchors (y = −H, z = −500).

## What the script should do

Inputs (all already on the hardware row): `nominal_length` (NL), `box_height` (H),
`runner_thickness` (37.5 for Dragon Pro). Same conventions as build_bin.py:

- Build in **mm**; export metres if you like (Claude reads either).
- **Left-hand runner** only; the app mirrors it for the right.
- Origin = gable inner face, at the drawer-box bottom line, at the **back** of the
  runner. **X** = in from the gable toward the drawer, **Y** = up, **Z** = toward the
  **front** (Z = 0 back, Z = NL front).
- Split the parts into **fixed** (cabinet member: what screws to the gable) and
  **moving** (drawer member + metal drawer side) groups, named like the bin script,
  so the app can slide the moving group out with the drawer.
- Name every part and give each a material (steel / zinc / plastic colours), like the
  bin script's `MATS`.

Nice to have (only if you have the detail): front fixing bracket / adjuster on the
drawer side, rear hook, the cabinet member's real shape instead of the solid block.

Keep the gable drilling OUT of the script — the app drills from the Dragon Pro's
drill ops (37 / 261 from the front, etc.), not from the model.
