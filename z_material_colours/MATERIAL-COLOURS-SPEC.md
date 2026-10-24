# Material colours (boards ▸ colours ▸ job colour grid) — Spec & Phase Tracker

> Living spec for board colours: one library row per board type, a colour list
> under each board, and per-job / per-room colour picks by class and role.
> Update status lines and decisions in the same change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → MC0 + MC1 done 2026-10-24: schema applied, 3 colours seeded
> (Classic White Matt, Boston Oak Woodmatt, Elegant Oak). Next: MC2 library UI.
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

**Proposed for MC6:** `projects` / `rooms` gain
`base|wall|tall_front_material_id` → materials (a colour row). When set, it is the
fronts board and colour, overriding the Colour Range pick's `material_id`. The
existing door Colour Ranges stay for supplier / painted doors and become a
fallback. To revisit at MC6 whether Colour Ranges then merge into board colours.

## 6. Resolver + warnings

1. The cascade order is unchanged: shop → job class → room class → cabinet
   override.
2. If the pick is a **board that has colours**, the resolver uses its
   `is_default_colour` row and adds warning **`COLOUR_NOT_CHOSEN`** ("<board>:
   colour not chosen, using <default>"). If there is no default colour, it throws
   a hard error.
3. **CNC nest:** the optimiser's Materials list flags any material reached through
   `COLOUR_NOT_CHOSEN` with the same warning (§0.6).
4. Edgeband: the colour's matched tape, else the schedule tape.
5. Persisted parts store the colour's `material_id`. Jobs stay static as built
   ([[job-version-pinning-model]]).

## 7. Phases

- [x] **MC0** Data fix: back colour = face on LX Colour 16mm, PT Colour Matt 16mm and PT Woodmatt 16mm (2026-10-24).
- [x] **MC1** Schema + seed (2026-10-24; board→colour propagation not yet proven by a real board edit).
  - [x] `unpackMatCol` back null = face.
  - [x] Apply `migration_mc1_board_colours.sql` (Mark ran it in the SQL editor).
  - [x] Seed PT Classic White Matt (under PT Colour Matt 16mm, default), Elegant Oak (under LX Abs Grain 18mm, `has_grain`, default) and
    Boston Oak Woodmatt (under PT Woodmatt 16mm, `has_grain`, default). Costs blank.
- [ ] **MC2** Library UI: boards list, colour sub-table, default radio, two-step pickers.
- [ ] **MC3** Resolver: board-with-colours → default colour + `COLOUR_NOT_CHOSEN`; colour-matched edgeband.
- [ ] **MC4** Job + room Colours tab: exposed grid row + interior picker (existing tables).
- [ ] **MC5** CNC nest Materials list shows the colour-not-chosen warning; cut lists / costing show colour names.
- [ ] **MC6** Fronts colour per class (§5) in the grid.
- [ ] **MC7** CSV import of colour lists (when Mark has the files).
- [ ] **MC8** Tutorial: "Job colours" (grid, room overrides, interior, colour-not-chosen warning).

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

- **One shared image:** a seamless greyscale timber-grain tile from a licence-free
  (CC0) source such as ambientCG or Poly Haven. Desaturated and levelled light
  (mean around 0.85) so tinting keeps the colour true. It ships with the app as
  `public/textures/grain_generic.jpg`, about 1024–2048 px, with its real tile
  size in mm recorded next to it.
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

- [ ] **MC9** Generic grain: source and level the CC0 tile, 3D tinted mapping at
  true scale with grain rotation, on for every `has_grain` colour.
- [ ] **MC10** Supplier image override: storage bucket, library upload / thumbnail,
  untinted use when set.
- [ ] **MC11** (optional) Elevation / print grain fills; second generic grain style.
