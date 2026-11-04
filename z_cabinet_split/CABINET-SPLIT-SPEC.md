# Cabinet height split — spec & phase tracker

> **Purpose**: split one cabinet into a lower and an upper section at a fixed shelf, so a tall
> unit can be made, carried and fitted in two pieces (e.g. RHK6581 butler's pantry, full-height
> open shelving under the stair). Living spec — update status and decisions in the same change
> as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → Height split complete 2026-10-25 (S1–S4 + S4a), all checked in-app by Mark.
> S6 back width cut built 2026-11-03 (data + resolver + drilling + optimiser + views), no UI yet, check pending.
> Every view shows the pieces: canvas + modal elevation / side (SPLIT line), 3D (room + modal: each side /
> back drawn as its pieces, own holes), Parts tab, cabinet sheet, cut list / optimiser / CNC.

---

## What it is (Mark, 2026-10-24)

> "right click split, then we need to work out where to split. the way i do it is usually 3mm
> below the top of a fixed shelf, so i split sides and back here. when the cabinet gets put
> together the 3mm lip fits over the fixed shelf and locks it together … right click split
> cabinet height, then right hand side bar shows up with x,y coordinates, and a splitter line
> tool. the app can offer split suggestions with the override by the user."

- The cabinet stays **one cabinet** (one label, one resolve). Only its **sides and back** are cut
  in two at the split height; the top and bottom are unchanged.
- **Where**: 3 mm below the **top of a fixed shelf**. The fixed shelf stays in the **lower**
  section, housed in the lower sides, standing **3 mm proud** of their top edge. The upper
  section (no bottom of its own) drops its sides over that 3 mm lip, which locates and locks the
  two together.
- **Suggestions**: one per fixed shelf (shelf top − 3). The user picks one, or overrides the
  height.
- **UI**: right-click → **Split cabinet height**. The right-hand sidebar shows the split (its
  x / y — y = the cut height), the suggestions, and a **splitter line** on the cabinet elevation
  the user can move. Start simple, see how it looks.

## Proposed (to confirm)

- Data: `cabinet_instances.split` jsonb `{ at: number[] }` (cut heights from the carcass bottom);
  library rows can carry a default. Part keys `left_side` → `left_side` (lower) +
  `split:left_side:1` (upper), same for `right_side` and `back` (case_parts key constraint
  extended).
- The lower sides stop at the cut; the upper sides start there. The back splits at the same height.
- Drilling: the shelf's joints stay with the lower sides; the upper sides' shelf / top joints move
  with them. Nothing drilled across the cut (fixing is the 3 mm lip + hand fixings).
- Drawings: elevation draws the cut line; cut list / labels show "Left Side (lower / upper)".
- Doors are not split.

## Answered (Mark, 2026-10-24)

1. **Doors stay full height** — a door across a cut is never split.
2. **One or two cuts** per cabinet.
3. **Hand fixings are enough** — nothing drilled across the cut (the 3 mm lip locates it).

## Phases

- [x] **S0** Spec (this file) — answered 2026-10-24
- [x] **S1** (2026-10-25) Data + resolver: `split` column, `src/lib/cabinetSplit.ts` (pieces, suggestions, piece lookup),
  persist payload cuts the sides / back, drill rows go to their piece (frame built as the base part),
  cut list (lower) / (upper) names, canvas fast path; tests `cabinetSplit.test.ts`
- [x] **S2** (2026-10-25) UI: right-click **Split cabinet height** (starts at the fixed shelf nearest mid-height),
  sidebar `CabinetSplitSection` (cut heights + off-the-floor, shelf suggestion buttons, + Add cut, Remove split),
  dashed red split line + height on the elevation (layer item `split_lines`). Dragging the line → S3.
- [x] **S3** (2026-10-25) Drag the split line in elevation (snaps to a shelf suggestion within 15, else the mm);
  cabinet sheet: SPLIT line on the front view + the parts list as (lower) / (upper) pieces; tutorial
  "Split a tall cabinet in height". Cabinet edit modal (Mark 2026-10-25): the SPLIT line on its Elevation
  and Side views (ResolvedViews), as on the canvas.
- [x] **S4** (2026-10-25) 3D (CabinetScene — room + modal): cut sides / back drawn as their pieces, each
  framed as its base part with only its own holes; modal Parts tab lists (lower) / (upper);
  `splitPieceSuffix` / `cutBaseKeys` shared by the cut list, cabinet sheet and Parts tab.
- [x] **S4a** (2026-10-25, Mark: back cut sat 16.5 high) The back sits on the bottom — its stored Y is one
  board (bottom.t) below where caseBox draws it — so `splitPieceRange` cuts it at Y + DZ (the same real height
  as the sides) and back pieces store Y = cut − DZ. A shaped cabinet's per-edge `side:<edge>` / `back:<edge>`
  panels (e.g. TC-08's angled back:back2) are cut too (height along DX from Y); piece key
  `split:back:back2:1`, DB constraint widened (`migration_s1b_shaped_pieces.sql`, applied).
- [x] **S5** (2026-10-31, Mark: "write split on the parts … indicate top, mid or bottom") Piece names are
  now `(split bottom)` / `(split mid)` / `(split top)` (was (lower) / (upper)) in the cut list, cabinet sheet and
  Parts tab, and the optimiser part comment (labels) leads with `SPLIT - BOTTOM` / `- MID` / `- TOP`, ahead of
  any user comment. `cutBaseKeys` returns base → piece count; `splitPiecePosition` / `splitPieceNote`.
- [~] **S6** (2026-11-03, Mark RHK6542 Study WC-04: "run it as 2 pieces with part comments on each piece
  'join together'") **Back width cut.** A back wider than a grained sheet is across the grain (1934 back vs
  1211 walnut sheet) can't have its grain up the panel in one piece, so it is cut across its width.
  - Data: `split.back_x` (cabinet-frame x from the cabinet's left, at most 2), beside `split.at`;
    `{ at: [], back_x: [983.5] }` is valid. Resolved as `split_back_x`.
  - Only the plain `back` is cut. Pieces sit side by side, left → right: `back` (left), `split:back:1`, …
    (same key scheme as the height split, so no DB change). A width-cut back is not also cut in height.
  - Cut edges untaped (the back's left / right flags). Holes go to the piece under them by x
    (`splitPieceFor(…, x)`); **nothing is drilled within 20 of a cut** (`BACK_CUT_CLEAR`) — WC-04's middle
    bay shelf screw landed right on the join.
  - Names `(split left)` / `(split right)` (`(split mid)` between); the optimiser comment is
    `SPLIT - LEFT · JOIN TOGETHER` automatically.
  - Grain: the optimiser now nests every back (and its pieces, shaped `back:<edge>` too) with the grain up
    the panel (`grain_across` on the part, as the 3D draws it). Before, a back nested with the grain along its
    width. A grained back wider than the sheet across the grain now needs this cut (or comes out unplaced).
  - Views: 3D draws the pieces with their own holes; Parts tab, cabinet sheet, cut list list the pieces.
  - The height-split sidebar / elevation drag keep `back_x` as is. No UI to set `back_x` yet (set in the DB).
  - Tests: `cabinetSplit.test.ts` "back width cut". Still to do: right-click / sidebar control, check in app.
  - Also on RHK6563 Study WC-05 (Tas Oak 18 back 304 x 1493, Mark 2026-11-03): `back_x [779.5]`, 2 x 746.5,
    nests clean grain-up.
- 2026-11-05 (RHK6478 US Hallway Linen TC-03, Mark): the canvas loads case parts from the DB, so a split
  cabinet arrives as its pieces (`split:left_side:1` …). The view helpers keyed on the bare part key, so the
  upper side piece drew lying flat in elevation (1676 long, out past the cabinet; out the front on the side
  walls) until the next live resolve. Now `caseBox` / `casePlanCorners` / `caseBevelOutline`, `casePartItem`,
  the canvas + print elevation rects and the edit-view `elevRect` / `topRect` / `sideRect` classify a piece by
  `splitBaseKey`. Rule: any geometry/layer check on a case part key must go through `splitBaseKey`.
