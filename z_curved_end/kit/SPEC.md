# Vanity Curved End: product spec for RHK-CADcam

This is the full rule set for the Resident Hero **Vanity Curved End** and its **both-ends-curved cabinet** variant, as built and shop-tested in the standalone web tool (Sept–Oct 2026). Everything here is implemented in `reference/curved_end_core.mjs`, which is the source of truth. If this document and that file ever disagree, the code wins.

Units are millimetres throughout.

---

## 1. What the product is

The product is a parametric curved end that sits beside a vanity, or a whole cabinet with curves on both front corners. It is made of:

| Part | Material | Notes |
|---|---|---|
| **Face board** (`ext_FaceBoard`) | Board, `FT` thick (usually 18, sometimes 16) | One continuous piece. It wraps front → curve → side, or for DOUBLE: side → curve → front → curve → side. It is flat everywhere except across each curve, where the **back** is pocketed down to a thin skin so it can bend. |
| **Fixing panel** (`int_FixingPanel`) | Carcass board, `T` thick (16.5 white melamine) | Single ends only. Vertical panel on the vanity side. It screws the end to the vanity and holds the formers. |
| **Back** (`int_Back`) | Carcass board | Full carcass height. Sits between the fixing panel and the face board's side (DOUBLE: between the two sides). |
| **Formers**: `int_Top`, `int_Bottom`, `int_Rib1…n` | Carcass board | Horizontal plates shaped to the inside of the face board, curve included. The face board is glued and screwed to them. |
| **Fixing blocks** (optional): `int_Block_Side`, `int_Block_Front` (DOUBLE: `int_Block_SideL`, `int_Block_SideR`, `int_Block_Front`) | Carcass board | Vertical strips lying flat against the back of the face board's straight sections. They are checked into the formers and screwed out into the face board. |

### Hands
- **RH**: curve on the right, vanity on the left. This is the native drawing orientation.
- **LH**: mirror of RH. In 3D the whole assembly is mirrored in x. In the DXFs, only parts whose shape is handed are mirrored (the formers and their cut-outs). The face board, fixing panel, back and blocks are identical for both hands, because they are simply fitted the other way round.
- **DOUBLE**: one cabinet with radius R on both front corners. It has no fixing panel and no vanity.

---

## 2. Inputs

| Key | Default | Meaning |
|---|---|---|
| `W` | 170 | Overall width (outside of face board) |
| `D` | 500 | Overall depth, front face to wall |
| `H` | 500 | Overall height of the face board |
| `R` | 150 | Outside radius of the curve(s) |
| `FT` | 18 | Face board thickness |
| `SK` | 2 | Skin left on the face board across the curve (pocket depth = `FT − SK`) |
| `T` | 16.5 | Carcass board thickness |
| `hand` | `RH` | `RH` / `LH` / `DOUBLE` |
| `OL`, `OR` | 0 | Back overhang, left / right. The face board runs past the wall line; it is trimmed after glue-up. Single ends use only the wall-side one (OR for RH, OL for LH). |
| `OG` | 0 | Gable overhang. Single ends only: the face board's front end runs past the fixing panel; trimmed after glue-up. |
| `SBK` | 0 | Back scribe. The carcass stops this far short of the wall; the face board stays full depth for site scribing. |
| `SBT` | 0 | Bottom scribe. The carcass sits this far up off the floor; the face board stays full height. |
| `STP` | 0 | Top scribe. The carcass stops this far below the top of the face board. |
| `lighten` | false | Cut out the centre of each rib (not the top or bottom). |
| `B` | 60 | Rib cut-out border |
| `onion`, `OS` | false, 0.3 | Leave an onion skin of `OS` on the rib cut-out (route depth `T − OS`) |
| `blkS` | false | Fixing block on the flat side |
| `blkF` | false | Fixing block on the flat front |

Fixed constants: pocket extension past each end of a curve `POCK_EXT = 3`; pocket overrun past the top and bottom edges `OVER = 8`; hole Ø `HOLE_D = 5`; hole inset `INSET = 50`; back-to-former hole inset `BACK_INSET = 40`; maximum hole pitch `MAX_PITCH = 250`; block widths `BLOCK_WIDE = 100`, `BLOCK_NARROW = 60`; through-hole overrun `THROUGH_EXTRA = 0.2`; outline overrun `OUTLINE_EXTRA = 0`.

---

## 3. Coordinate conventions (important)

**Plan coordinates** `(x, d)`:
- `x` runs across the unit. `0` is the vanity/fixing-panel side (DOUBLE: the left outside face) and `W` is the outside face.
- `d` is depth from the front. `0` is the front face and `D` is the wall.
- Everything is computed for **RH**; LH is mirrored at the end.

**Curve centre**: `(CX, CD) = (W − R, R)`. On DOUBLE the left curve centre is `(R, R)`.

**Loops**: closed outlines are lists of `[x, d, bulge]`. The bulge is DXF-style: `tan(sweep/4)` of the arc from this vertex to the next, positive = anticlockwise when `d` is drawn upward. A 90° arc has bulge `TB = tan(π/8) ≈ 0.41421`. `revLoop` reverses a loop's direction (each bulge moves to the new segment start and flips sign). `mirLoop` mirrors across x and keeps the direction.

**3D (three.js)**: plan `(x, d)` maps to world `(x, up, −d)`. Plan shapes are extruded upward.

**DXF part coordinates**: each part sits with its minimum corner at 0,0. The formers are drawn as a **true top view with the front at Y0**. The face board is drawn **back face up**, with its front (gable) end at X0 on single ends and the left wall end at X0 on DOUBLE.

---

## 4. Derived geometry (see `calc(p)`)

```
Dc = D − SBK                    carcass depth (back face of the back panel)
Hc = H − SBT − STP              carcass height
y0 = SBT                        carcass sits this far up inside the face board
RI = R − SK                     former corner radius (inside of the skin)
arc = π/2 · R                   outside arc length of one 90° curve
```

**Ribs**: the maximum clear gap is `170` if `SK ≤ 2`, otherwise `250`. Use the smallest number of gaps `g` such that `(Hc − (g+1)·T)/g < maxGap`. Then:
- `pitch = (Hc − T)/g`
- former levels (underside, from the carcass bottom) are `i·pitch` for `i = 0…g`
- the Bottom is level 0, the Top is level `g`, and `Rib1…Rib(g−1)` are the levels in between
- former centrelines (used for holes) are `level + T/2`

### Face board (flat length and pockets)

**Single:**
```
wrapLen = OG + CX + arc + (D − R) + OV          OV = OR for RH, OL for LH
pocket  = [OG + CX − 3, OG + CX + arc + 3]
```

**DOUBLE** (with `side = D − R` and `flat = W − 2R`):
```
wrapLen = OL + 2·side + 2·arc + flat + OR
pocket1 = [OL + side − 3, OL + side + arc + 3]
pocket2 = [OL + side + arc + flat − 3, OL + side + 2·arc + flat + 3]
```
If the two pockets overlap, they are merged into one.

Each pocket runs `−8 → H + 8` across the board, so it overruns both edges. Pocket depth is `FT − SK`, on the back face.

The pocket is measured along the **outside face**, which doesn't stretch when the board is bent. The 3 mm extension each side gives positioning slack at glue-up. In the formers, the shoulders stay at the true tangent points, so that slack shows as a 3 mm gap.

### Formers (plan loop, RH single)
```
[T, FT] → [CX, FT] → [CX, SK, bulge TB] → [W − SK, R] → [W − FT, R] → [W − FT, Dc − T] → [T, Dc − T]
```
That is: the front edge sits behind the full-thickness board (`d = FT`). It steps forward to the skin (`d = SK`) at the start of the curve, follows radius `RI` around to `x = W − SK`, steps back in to the full board (`x = W − FT`), then runs straight to the back.

Bounding box: `(W − SK − T) × (Dc − T − SK)`. In DXF, `x − T` and `d − SK`.

**DOUBLE** is symmetric with both curves:
```
[FT, Dc−T] → [FT, R] → [SK, R, TB] → [R, SK] → [R, FT] → [W−R, FT] → [W−R, SK, TB] → [W−SK, R] → [W−FT, R] → [W−FT, Dc−T]
```
When `W = 2R` exactly (half-round front, no flat), the front shoulders drop out:
```
[FT, Dc−T] → [FT, R] → [SK, R, TB] → [R, SK, TB] → [W−SK, R] → [W−FT, R] → [W−FT, Dc−T]
```
Bounding box: `(W − 2·SK) × (Dc − T − SK)`. In DXF, `x − SK` and `d − SK`.

### Fixing blocks (notches change the former loop)

Each block is `T` thick, `Hc` long, and `w = 100` if the straight it sits on allows it, else `60`, else there is no block (a non-blocking note is shown).

| Block | Available straight | Plan position | Former loop change |
|---|---|---|---|
| Side (RH single) | `(Dc − T) − (R + 3)` | `x ∈ [W−FT−T, W−FT]`, `d ∈ [Dc−T−w, Dc−T]` (hard to the back) | vertex `[W−FT, Dc−T]` becomes `[W−FT, Dc−T−w], [W−FT−T, Dc−T−w], [W−FT−T, Dc−T]` |
| Side L (DOUBLE) | same | `x ∈ [FT, FT+T]`, same d range | vertex `[FT, Dc−T]` becomes `[FT+T, Dc−T], [FT+T, Dc−T−w], [FT, Dc−T−w]` |
| Front (single) | `(CX − 3) − T` | `x ∈ [T, T+w]`, `d ∈ [FT, FT+T]` (hard to the fixing panel) | vertex `[T, FT]` becomes `[T, FT+T], [T+w, FT+T], [T+w, FT]` |
| Front (DOUBLE) | `(W−R−3) − (R+3)` | centred: `x ∈ [W/2 − w/2, W/2 + w/2]`, `d ∈ [FT, FT+T]` | insert `[a, FT], [a, FT+T], [b, FT+T], [b, FT]` after `[R, FT]` |

### Rib cut-out (`ribCutout`)

The rib cut-out is the former outline inset by `B`. The rib is treated as convex: the small shoulders are ignored, which only ever makes the border bigger.

The inset rectangle is:
- Single: `x ∈ [T+B, W−FT−B]`, `d ∈ [FT+B, Dc−T−B]`
- DOUBLE: `x ∈ [FT+B, W−FT−B]`

The corner(s) are clipped by a circle of radius `RI − B` about the same curve centre. Any edge with a block notch moves in a further `T`. The result is null (no cut-out) if the inset is under 30 in either direction.

Output is anticlockwise. Verified: the minimum border is exactly `B` in every fixture.

### Other parts
- **Fixing panel** (single): `(Dc − FT) × Hc`. X0 is the front edge.
- **Back**: `backW × Hc`, where `backW = W − FT − T` (single) or `W − 2·FT` (DOUBLE). X0 is the vanity-side edge (DOUBLE: the left edge).

---

## 5. Fixing holes (Ø5 through, layer `VBOREZ<T+0.2>`)

`spread(len, inset, maxPitch)` places holes `inset` in from each end, evenly, at most `maxPitch` apart. If `len ≤ 2·inset`, it places one centred hole.

| Part | Holes | Screws into |
|---|---|---|
| Fixing panel | X = `spread(Dc−T−FT, 50, 250)` × Y = each former centreline | the formers' edges |
| Fixing panel | X = `Dc − T/2 − FT`, Y = `spread(Hc, 50, 250)` | the back's edge |
| Back | X = `spread(backW, 40, 250)` × Y = each former centreline | the formers' back edges |
| Each block | X = `w/2`, Y = `spread(Hc, 50, 250)`; drop any within 20 of a former hole | out into the face board |
| Each block | X = `[25, w−25]` if `w ≥ 80`, else `[w/2]`; Y = each former centreline | back into every former's notch edge |

Every hole is centred on the thickness of the part it screws into.

---

## 6. DXF export: Planit S2M Center / NC Center 5.0, Default layer scheme

- **One DXF per part, and the file name is the part name** (S2M has no part-name field in the DXF). Names start with `ext_` for external (the face board) or `int_` for internal (all carcass parts). There is no job word and no hand in the name; the zip carries those.
- **Format**: DXF **R12** (`AC1009`), with POLYLINE/VERTEX/SEQEND (bulges on vertices) and CIRCLE. The page writes its own minimal R12 file (`dxfDoc`).
- **Layer names** carry the machining; `P` is the decimal point and names are case sensitive.

| Layer | Use |
|---|---|
| `PART` | Bounding rectangle (anticlockwise) |
| `OUTLINEZ<t>L` | Part outline, drawn **clockwise** so left comp = outside. Depth exactly the board thickness (`OUTLINEZ18L`, `OUTLINEZ16P5L`). |
| `PKZ<FT−SK>` | Face board pocket, e.g. `PKZ16`. Back face up, so no `S` tag. |
| `VBOREZ<T+0.2>` | Ø5 through-holes, e.g. `VBOREZ16P7` |
| `ROUTEZ<T−OS>L` | Rib cut-out, drawn **anticlockwise** so the cutter stays in the waste, e.g. `ROUTEZ16P2L` (0.3 onion) or `ROUTEZ16P5L` (through) |

Other S2M rules:
- **Draw the finished shape, never the tool centreline.** S2M sizes each operation from its geometry plus comp.
- **No mirrored parts** in S2M. Handed parts are drawn as their true top view.
- **Back-up is S2M's default**, so operations with no `S` tag go on the up face.
- **Grain** (confirmed on the banquette job): NC Center reads DXF X as width (across the grain) and Y as length (with the grain). Sheets are 2400 with the grain × 1200 across. If the face board is a grain board, export it with its length along Y. The curved end currently draws the face board length along X; this is **not yet applied or checked** here.

---

## 7. Validation

**Warnings** (block the export):
- Single: `CX − 3 < T`. The pocket would start over the fixing panel.
- DOUBLE: `W < 2R`.
- `R + 3 > Dc − T − 20`. The radius is too big for the depth after the back scribe.
- `Hc < 3T + 40`. The scribes leave too little carcass.
- `SK ≥ FT`.

**Notes** (shown, but don't block the export):
- There is no room for a requested fixing block.

---

## 8. Shop-floor learnings and open items

- **Pocket cut too deep (03.10.2026, cause not confirmed).** A face board pocket went right through plus about 1 mm into the spoilboard instead of leaving the 2 mm skin. The exporter writes `PKZ<FT−SK>` correctly. Suspects:
  1. The face board thickness setting didn't match the board on the machine.
  2. The S2M layer scheme isn't reading the `Z` depth keyword (it uses another letter, or "Use thickness as depth" is True).
  3. The pocket overruns the part edges.

  If RHK-CADcam generates its own G-code for this part, check the pocket depth against the material thickness explicitly.
- **Tool numbers** could be added through S2M's `T` keyword (e.g. `OUTLINEZ18LT3`). Not done yet.
- Each export also saves a **job file** (`<prefix>_job.json`, `{app:"vanity-curved-end", version, saved, job, settings, summary}`) so a job can be reloaded later.

---

## 9. Test fixtures

- `fixtures/cases.json` holds 10 input sets covering RH, LH, DOUBLE, half-round, overhangs, all scribes, the 250 gap rule, rib cut-outs with onion skin, fixing blocks at 100 and 60, and a warning case.
- `fixtures/expected.json` holds the derived numbers for each case: face board length, pockets, rib count and pitch, part sizes, blocks, warnings and notes, and the file list.
- `fixtures/dxf/<case>/` holds the golden DXFs.
- `fixtures/check_dxf.mjs <expectedDir> <yourDir>` compares two folders of DXFs entity by entity to 0.01 mm. It ignores entity order and header differences.

The reference JS and the Python twin (`reference/curved_end.py`) both reproduce every fixture exactly.
