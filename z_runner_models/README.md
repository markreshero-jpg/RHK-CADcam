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

## In the app (as built 2026-10-17)

- `hardware_slides.drawn_as` (`dragon_pro` | null) picks the family; set it per row in
  Library → Materials → Slides → the row's 3D model panel ("Drawn as"). An uploaded
  `model_url` still wins — remove it to see the parametric drawing.
- `src/lib/runnerGeometry.ts` `runnerShape(rail)` = the build_runner.py port, placed on
  each resolved rail (left from the member face, right mirrored; Y = drawer-box bottom
  line; Z = back of runner → +NL front). `src/components/three/Runner3D.tsx` draws it for
  face-drawer and inner-drawer rails; the drawer side slides with the drawer, the cabinet
  member stays (`FixedInDrawer`, shared with the bin frame).
- 3D only. Elevation still draws runners as their box / uploaded-model outline.

## Library range (2026-10-17)

`migration_dragon_pro_range.sql` (applied): Dragon Pro NL 300 / 350 / 400 / 450 × H 95 / 127 / 178,
cloned from the 500 of the same height, gable rear-bracket hole per length (300/350 → 165,
400 → 229, 450/500 → 261; front 37), `drawn_as = dragon_pro`, and entries in the
"DTC Dragon Pro" slide schedule. Data: `NIKPOL-DRAGON-PRO-RESEARCH.md` (Nikpol 2026 tilt-adjust
install guide). Open: gable hole HEIGHT isn't dimensioned in the guide — rows keep the shop's 44
from the 500s; no prices (Nikpol login).

## Drilling check against the guide (2026-10-17)

Nikpol has no separate Dragon Pro drilling guide — the drilling is page 7 ("DTC dragon pro
drilling") of the Tilt Adjust Installation Guide (saved here, + page renders). Checked every
library row against it:

| Holes | Guide | Library | |
|---|---|---|---|
| Gable, front bracket | 37, 69 (third hole of each 9-pitch cluster, clusters 32 apart) | 37 + 32 | ✅ all lengths |
| Gable, rear bracket | 300/350: 165, 197 · 400: 229, 261 · 450/500: 261, 293 | rear + 32 | ✅ all lengths |
| Gable, height | not dimensioned | 44 | ❓ |
| Back, 95 | 32, 64 up the 84 back | 32, 64 | ✅ |
| Back, 127 | 30, 62, 94 up the 116 back | 32, 96 | ❌ |
| Back, 178 | 32, 64, 96, 128 up the 167 back | 32, 128 | ⚠ 2 of 4 |
| Front, 95 | 47.5, 79.5 | same | ✅ |
| Front, 127 | 47.5, 79.5, 111.5 | same | ✅ |
| Front, 178 | 47.5, 79.5, 143.5, 175.5 (pairs, 128 apart) | 47.5, 79.5, 111.5, 143.5 | ❌ |

(Back holes: guide gives them down from the back's top — 20 / 22 / 39, 32 pitch, 9 in.
The DTC Dragon Pro drawer-box method makes the back box height − 11 = 84 / 116 / 167, as the guide.)
