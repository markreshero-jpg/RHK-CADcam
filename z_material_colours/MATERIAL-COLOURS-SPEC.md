# Material colours (boards ▸ colours ▸ job colour grid) — Spec & Phase Tracker

> Living spec for board colours: one library row per board type, a colour list
> under each board, and per-job / per-room colour picks by class and role.
> Update status lines and decisions in the same change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → MC0 + MC1 done 2026-10-24: schema applied, 3 colours seeded
> (Classic White Matt, Boston Oak Woodmatt, Elegant Oak). MC2 library UI, MC3 resolver, MC4 pickers, MC5 warnings + nest, MC6 fronts colour, MC8 tutorials, MC9 grain, MC11 elevation / print grain done. Next: MC7 CSV import (waits on supplier files), MC10 supplier images (optional).
> Grain: generic tinted tile by default, supplier images optional (§8).

---

## 0. Locked decisions (Mark, 2026-10-24)

1. **One library row per board type**, with colours listed under it. No
   per-colour boards, and no A/B/C duplicate boards.
2. **Colours are picked per class and role**, at job level, and **a room can
   override any of them**:

   | | Doors / drawers (fronts) | Exposed |
   |---|---|---|
   | **Base** | base fronts | base exposed |
   | **Wall** | wall fronts | wall exposed |
   | **Tall** | tall fronts | tall exposed |

   These six picks replace the free "Colour 1/2/3" palette slots from the first
   draft, which are dropped. "Swap a colour once" = change the cell. The Colours
   tab gets a "same as…" / apply-to-all helper so a single-colour job is still a
   couple of clicks.
3. **Interior is separate**, not in the grid and not auto-tied to any colour. It
   is normally 16mm Whiteboard, with a simple job/room picker for the occasional
   grey interior. It still resolves through the existing `interior` role.
4. **Pricing is per colour** (`cost_per_sheet` on the colour row). Left blank for
   now, to be filled later by CSV import or by hand. No price groups.
5. **First colours:**
   - **PT Classic White Matt**, under board `PT Colour Matt 16mm`.
   - **Polytec Boston Oak Woodmatt**, under board `PT Woodmatt 16mm`. It is a
     timber grain, so `has_grain = true`, and it sits on a different board.
6. **Board picked with no colour** (e.g. a shop default names the generic board):
   the board's default colour is used, **plus a "colour not chosen" warning**. The
   warning shows in the cabinet errors **and in the CNC nest Materials list**.
7. **The Laminex / Polytec decors here are the same colour both sides.**
   `back_colour` null = face colour, and all three generic boards now have
   back = face.

## Why

The new `LX Colour 16mm` board showed white on its back face because the row's
`back_colour` was `#ededed`. The bigger problem is that a library with one row per
board per colour turns into hundreds of near-identical materials, each needing its
own price, sheet size, edgeband and CNC settings kept in step.

The colour still has to be a real picked value and not free text, because it
drives:

- **Nesting.** Walnut and Polar White must never share a sheet.
- **Grain.** Woodgrains are grained and plain colours aren't.
- **Matching edge tape.**
- **Back face.**
- **Cost.**
- **Real colour names** on cut lists, orders and costing.

```
 LIBRARY                                   JOB  (room may override any cell)
 ───────                                   ───
 Board: PT Colour Matt 16mm                         Fronts            Exposed
   └ Classic White          ──────────►   Base   PT Woodmatt/Oak    PT Woodmatt/Oak
 Board: PT Woodmatt 16mm                   Wall   PT Matt/White      PT Matt/White
   └ Boston Oak (grain)     ──────────►   Tall   PT Matt/White      PT Matt/White
 Board: Whiteboard 16.5 (no colours)  ──►  Interior: Whiteboard 16.5  (grey option)
```

## 1. Current state (2026-10-24)

- `materials` is one flat list, and each row is a full board.
- **Exposed, per class:** the cascade is `assembly_schedule_rows` /
  `shop_material_defaults` → `job_materials` → `room_materials` → cabinet
  `material_overrides` (`{ role: material_id }`). The job and room tables are
  already keyed by `(assembly_class, material_role)`, so **base/wall/tall exposed
  already fit them**. Resolved in `src/lib/resolver/loadCabinetInput.ts`.
- **Fronts, per class:** `projects` and `rooms` `base|wall|tall_door_style_id` +
  `_door_colour_id` → `door_schedule_materials` (Colour Ranges), whose
  `material_id` links a board (DOOR_SYSTEM_SPEC §6). `resolveFace.ts` uses
  `colour_material_id`.
- Everything downstream keys on `material_id`: persisted parts, optimiser sheets
  and margins (`src/lib/optimiser/store.ts`, `types.ts buildMargins`), 3D colours
  (`useMaterialColours.ts` → `unpackMatCol` / `panelFaceColors`), and reports.
  There are 21 `from('materials')` readers across 17 files.
- `edge_banding.material_match_id` already exists (tape ↔ material link).

## 2. Core model — a colour IS a material row (child of a board)

Each colour is stored as a `materials` row with `parent_id` → its board.

- **Downstream code is unchanged.** The resolver, persisted parts, optimiser,
  margins, 3D view and reports still see one `material_id` per part. A colour id
  is a material id, so **nesting splits by colour automatically**.
- **The library UI hides the child rows.** The Materials tab lists boards
  (`parent_id is null`), and each board expands to its colours.
- **Trigger `materials_colour_inherit`** (BEFORE insert/update on colour rows):
  - Copies from the board: `dz, brand, cnc_tool_id, trim_*, pad, feed_rate_pct`.
  - Copies `sheet_dx/dy` unless the colour lists them in `overridden`.
  - Generates `name = '<board name> – <colour_name>'`, so existing readers print
    the real colour with no code change.
  - Refuses a colour whose parent is itself a colour, or a colour with no
    `colour_name`.
- **Trigger `materials_board_propagate`** (AFTER update on a board) touches its
  colours, so board edits flow down.
- **Colour-owned fields:** `colour_name, colour_code, face/back/edge_colour,
  has_grain, grain_direction, finish, cost_per_sheet`.
- **A board with no colours keeps working as it does today**, as a plain board
  used directly (Whiteboard, MDF).

| new column | purpose |
|---|---|
| `parent_id uuid null` → materials | null = board; set = colour of that board |
| `colour_name text` | e.g. `Classic White` |
| `colour_code text` | supplier code |
| `is_default_colour bool` | the board's fallback colour (one per board, unique index) |
| `overridden text[]` | inherited fields this colour overrides (`sheet_dx`, `sheet_dy`) |

**Back face:** `back_colour` null = same as face. `unpackMatCol` in
`src/components/three/PartViewer.tsx` now falls back to the face colour, not
white. Set `back_colour` only for a real backer board.

**Edge tape per colour:** a colour's matching tape is the `edge_banding` row with
`material_match_id` = the colour. The resolver uses it when present, otherwise the
schedule row's `edgeband_id`. This also fixes the audit's "overrides keep the old
edgeband" gap for colour swaps.

## 3. Library UI (Library → Materials)

- The **Boards** list shows parent rows only. Each row gets an "N colours" chip
  and expands to its colour table.
- The **colour table** has: colour name, code, face / back / edge swatches
  (back blank = face), grain tick, matching tape, cost per sheet, sheet size
  override, and a default-colour radio.
- **CSV import** of a supplier colour list into a board (later).
- Material pickers elsewhere: pick a board, then a colour. A board with no
  colours is picked directly.

## 4. Job / room colours

Job Properties gets a **Colours** tab, and Room properties gets the same tab with
every cell blank = inherit the job.

- **The 3 × 2 grid (§0.2).** Each cell picks a board, then a colour.
  - **Exposed cells** write `job_materials` / `room_materials` rows
    `(class, 'exposed')`. These tables already exist.
  - **Fronts cells** set the front colour per class (§5).
  - Helpers: "Same as base" on the wall and tall rows, and "Exposed = fronts".
- **Interior picker** (§0.3): one pick, written as `(class, 'interior')` rows for
  base, wall and tall. Defaults to the shop's Whiteboard.
- Cabinet-level `material_overrides` still win over the grid for one-offs.

## 5. Fronts — colour vs door style

The door **style** (profile / blank) stays in the door system. The fronts **colour**
cell needs to point at a board colour.

**Built at MC6 (2026-10-25), no schema change:** the fronts colour is a
`door_face` row in `job_materials` / `room_materials` per class (the grid's
"Doors / drawers" row). Precedence, weakest first: job Doors-tab colour 1 · job
grid 2 · room Doors-tab colour 3 · room grid 4 · cabinet `material_overrides.door_face`
5. When the grid pick wins, every front takes that board + colour and the
`door_face` tape (colour-matched, else the style's tape); the style keeps profile +
thickness. Blank grid = Doors tab as before. Doors-tab colours whose
`material_id` is a board with colours fall back to its default colour +
`COLOUR_NOT_CHOSEN` ("Doors: …"). Colour Ranges stay; merging them into board
colours is left open.

## 6. Resolver + warnings

1. The cascade order is unchanged: shop → job class → room class → cabinet
   override.
2. If the pick is a **board that has colours**, the resolver uses its
   `is_default_colour` row and adds warning **`COLOUR_NOT_CHOSEN`** ("<board>:
   colour not chosen, using <default>"). If there is no default colour, it keeps
   the board itself and warns (changed from a hard error at MC3 so adding
   colours to a board in use can never stop cabinets resolving).
3. **CNC nest:** the optimiser's Materials list flags any material reached through
   `COLOUR_NOT_CHOSEN` with the same warning (§0.6).
4. Edgeband: the colour's matched tape, else the schedule tape.
5. Persisted parts store the colour's `material_id`. Jobs stay static as built
   ([[job-version-pinning-model]]).

## 7. Phases

- [x] **MC0** Data fix: back colour = face on LX Colour 16mm, PT Colour Matt 16mm and PT Woodmatt 16mm (2026-10-24).
- [x] **MC1** Schema + seed (2026-10-24; board→colour propagation proven by a dz edit).
  - [x] `unpackMatCol` back null = face.
  - [x] Apply `migration_mc1_board_colours.sql` (Mark ran it in the SQL editor).
  - [x] Seed PT Classic White Matt (under PT Colour Matt 16mm, default), Elegant Oak (under LX Abs Grain 18mm, `has_grain`, default) and
    Boston Oak Woodmatt (under PT Woodmatt 16mm, `has_grain`, default). Costs blank.
- [x] **MC2** Library UI (2026-10-24): Board Stock lists boards only with an "N colours" chip; selecting a board opens `BoardColoursEditor` (name, code, finish, face/back/edge, grain, matching tape, sheet override, $/sht, default radio, active; saves on blur). Two-step board→colour pickers moved to MC4.
- [x] **MC3** Resolver (2026-10-25): `applyBoardColours` in loadCabinetInput (after cabinet overrides) swaps a board-with-colours for its default colour + `COLOUR_NOT_CHOSEN` (carried on `CabinetInput.material_warnings`, `ResolverError.material_id` = colour used); roles on a colour take its matched tape (colours only; plain boards keep schedule tapes). Covers matMap + kick roles; door Colour Range picks (`colour_material_id`) not yet — MC6. Checked live: forced exposed → PT Woodmatt board gave Boston Oak + warning; matched tape picked up; control cabinet unchanged. **Gap:** resolver warnings are not persisted (canvasDB loads `warnings: []`), so the warning only shows after a cabinet re-resolves; MC5 must persist or re-derive it for the nest.
- [x] **MC4** (2026-10-25) Two-step `BoardColourSelect` (board, then colour; board-with-colours and no colour saves the board and shows amber "choose colour" = resolver warns). Used in the existing Interior/Exposed × base/wall/tall grid (Job Properties → Cabinet Standards → Material Schedules; Room Properties → Materials for room overrides) and the toe-kick rows, instead of a new Colours tab. "Copy to wall & tall" on the base column. Headless-checked on the job grid (pick board → amber, pick colour → saved colour id); room mode + copy button not clicked.
- [x] **MC5** (2026-10-25) Resolver warnings now persist inside `cabinet_instances.resolved_drawer_hw.warnings` (rides the existing persist RPC blob, no schema change) and load back in canvasDB, so warnings show on page load. Nest: cabinets carry `colour_warnings` (`warnings:resolved_drawer_hw->warnings`, filtered to COLOUR_NOT_CHOSEN); Stage 2 Materials chip gets ⚠, Stage 3 material group "⚠ colour not chosen", Stage 4 amber note naming the colour + cabinets. Colour names on cut lists / nest come from the trigger-built `name` ("Board – Colour"). Checked end-to-end on RHK1234 BC-02 (job base interior → bare PT Woodmatt board: persisted Boston Oak + warning, all three nest spots showed it), then restored. Note: a board-without-colour pick warns on every cabinet of that class, even ones with no parts in that role.
- [x] **MC6** (2026-10-25) Fronts colour per class (§5): "Doors / drawers" grid row + resolver precedence; Doors-tab colours on a board-with-colours fall back + warn. Checked live on RHK1234 BC-02: job base fronts → Classic White Matt applied over the Doors tab; with it removed, the Doors-tab colour on bare PT Woodmatt fell back to Boston Oak + "Doors:" warning. Door colour "Elegant Oak" (Laminex Absolute Grain) relinked to the Elegant Oak colour row; the generic "Colour A" / "Colour TBC" door colours stay on their boards (they warn).
- [ ] **MC7** CSV import of colour lists (when Mark has the files).
- [x] **MC8** (2026-10-25) Tutorials in a new "Materials & colours" topic: "Pick the job colours" (Basics) and "Add colours to a board" (Intermediate); events mat_board_pick / mat_colour_pick / mat_copy_classes / job_materials_tab / props_saved / board_colour_added; store test added. In-app review by Mark pending.

### MC1 seed (run after the migration)

```sql
insert into materials (parent_id, colour_name, face_colour, edge_colour, has_grain, is_default_colour, finish, active)
select id, 'Classic White Matt', '#f1f0eb', '#f1f0eb', false, true, 'Matt', true
  from materials where name = 'PT Colour Matt 16mm' and parent_id is null;
insert into materials (parent_id, colour_name, face_colour, edge_colour, has_grain, is_default_colour, finish, active)
select id, 'Boston Oak Woodmatt', '#b48a5e', '#b48a5e', true, true, 'Woodmatt', true
  from materials where name = 'PT Woodmatt 16mm' and parent_id is null;
insert into materials (parent_id, colour_name, face_colour, edge_colour, has_grain, is_default_colour, finish, active)
select id, 'Elegant Oak', '#b98d5f', '#b98d5f', true, true, 'Grain', true
  from materials where name = 'LX Abs Grain 18mm' and parent_id is null;
```

## 8. Decor textures (woodgrain patterns)

**Locked (Mark, 2026-10-24): a generic grain, tinted by the colour, is the default.
Real supplier images are an optional per-colour upgrade.**

Every `has_grain` colour shows timber grain with no per-colour work. A colour only
needs its own image when the exact decor figure matters (e.g. a client choosing
between two oaks).

### 8a. Generic grain (default)

- **One shared tile, drawn in code (MC9 / MC9b):** `woodGrain.ts` draws a white
  tile with thin dark grey grain lines (line-drawing style, Mark 2026-10-25), so
  the face keeps its exact colour and the grain reads as linework. One tile =
  300 mm across × 1200 mm along.
- **Tint:** in 3D, a grained colour's face = generic grain map × `face_colour`.
  Boston Oak, Elegant Oak and Walnut each read as their own colour from the same
  image.
- **Applies to every colour with `has_grain = true` and no `texture_path`.**
  Plain colours stay flat.
- **Later, optional:** a second generic tile (straight grain vs crown /
  cathedral), picked per colour with a `grain_style` column. Not in the first build.

### 8b. Supplier image (optional override)

- **Columns on the colour row** (in the MC1 migration): `texture_path`, plus
  `texture_w_mm` and `texture_h_mm`, the real-world size of one tile
  (W = across the grain, H = along the grain).
- **When `texture_path` is set,** that image is used untinted instead of the
  generic grain.
- **Storage:** Supabase Storage bucket `material-textures`, as compressed
  JPG/WebP at about 1024–2048 px.
- **Where the images come from:** Laminex / Polytec designer downloads (some need
  a free trade login), placed by Mark in `z_material_colours/textures/`. Claude
  uploads them. No site scraping.
- **Library:** the colour row gets a thumbnail plus an upload / replace / clear
  button. Tile size defaults to the image's stated size, or 1200 × 2400 when it is
  unknown.

### 8c. Mapping rules (both kinds)

- Each texture loads once per material and is cached.
- **True scale:** repeat = part size ÷ tile mm.
- **Grain direction:** rotate by the part's grain direction, so grain runs along
  DY (length), following [[cv-part-dimension-convention]]. Doors and drawer fronts
  use the same rule.
- **Edges** stay the tape colour. `face_colour` remains the average colour, used
  for plan view and while an image loads.
- **Later, optional:** pattern fill in elevation and shop drawings.

### Phases

- [x] **MC9** (2026-10-25) Generic grain in 3D: `src/components/three/woodGrain.ts` draws the tile procedurally (no image file); `GrainContext` set from `materialColours[*].grain` (has_grain) in `CabinetScene`; `Part` maps the two big faces at true scale (tile 300 across × 1200 along) with grain along DY via `extForAxes`; CSG-cut panels get one map for their big faces; shaped (extruded) parts stay flat. Room 3D, cabinet modal 3D and preview all go through CabinetScene. Checked in the room 3D on RHK1234 (Boston Oak doors grained vertically, Whiteboard flat).
- [x] **MC9b** (2026-10-25, Mark: "looks a bit funny", wrong direction on backs + curved panels) Restyled for the line-drawing 3D: white tile (= exact face colour) with thin dark grey grain lines that wander gently, some in close pairs (seeded random, wrapped so it tiles), no tonal shading. Direction rule `grainExtents` replaces DY: upright panels (sides, doors, fronts, backs, wrap / shaped panels, end panels) grain up the panel; kick boards (`tk_`) and horizontals along their length. Shaped / curved (extruded) parts now grained via `shapedGrainMaps` (ExtrudeGeometry uvs are mm): wrap panels up the extrusion, sharknose along the profile. Checked on RHK6581 Living J06 with grain forced in-page (curved end + backs + doors vertical, kick horizontal).
- [ ] **MC10** Supplier image override: storage bucket, library upload / thumbnail,
  untinted use when set.
- [x] **MC11** (2026-10-25) Ghost grain in elevations: new layer item `grain` (Fronts group, elevation + 3D, default on; the 3D grain is gated by it too). `GrainSVG.tsx` draws a 7% shade + the shared grain lines (`src/lib/grainLines.ts`, also used by the 3D texture) at 40% stroke opacity, clipped to the panel with plain path + clipPath (no SVG pattern, for svg2pdf), tiled on a fixed wall grid. Fronts + face-on added parts up the panel, kick boards along. On-screen elevation (`ElevationSVG`) + printed Elevation Views / shop drawings (`ElevationPrintSVG`). Layer colour / opacity / weight restyle it per layer set. Checked on RHK1234 (screen + Elevation Views preview); the downloaded PDF not inspected. Second generic grain style still open.
