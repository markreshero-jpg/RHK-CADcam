# Material colours (boards ▸ colours ▸ job palette) — Spec & Phase Tracker

> Living spec for board colours: one library row per board type, a colour list
> under each board, and a per-job colour palette that roles and cabinets point at.
> Update status lines and decisions in the same change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → Spec drafted 2026-10-24, not locked. MC0 data fix done.
> Next: Mark answers the open questions (§7), then MC1 schema.

---

## Why

The new `LX Colour 16mm` board showed white on its back face because the row's
`back_colour` was `#ededed`. The bigger problem is that a library with one row per
board per colour turns into hundreds of near-identical materials, each needing its
own price, sheet size, edgeband and CNC settings kept in step.

Mark's goal: **one row per board type** (e.g. `LX Colour 16mm Matt`), with the
colour/finish picked **in the job**.

The colour still has to be a real, picked value and not free text, because it
drives:

- **Nesting.** Walnut and Polar White must never share a sheet.
- **Grain.** Woodgrains are grained and plain colours aren't.
- **Matching edge tape.**
- **Back face.** Same decor both sides, or a white backer.
- **Cost group and available sheet sizes.**
- **Real colour names** on cut lists, orders and costing.

We rejected the "A/B/C slots in the library" idea (`LX Colour 16mm Matt A`,
`… B`). It duplicates boards again, caps a job at 3–4 colours, and prints
meaningless "Matt A" on reports. The useful part of the idea, swapping a colour
once for the whole job, becomes the **job colour palette** (§4).

```
 LIBRARY                                 JOB (project)                 CABINET / ROLE
 ───────                                 ─────────────                 ──────────────
 Board: LX Colour 16mm Matt   ──┐        Palette                       exposed  → Colour 1
   ├ Natural Walnut  (grain)    ├──────► Colour 1 = LX Matt / Walnut   interior → Colour 2
   ├ Polar White                │        Colour 2 = LX Matt / Polar    doors    → Colour 1 (§7 Q3)
   └ Oak Classic     (grain)    │        Colour 3 = PT Woodmatt / Oak
 Board: PT Woodmatt 16mm      ──┘
   └ …
```

## 1. Current state (2026-10-24)

- `materials` (`id, name, brand, finish, dz, sheet_dx/dy, has_grain, grain_direction,
  cost_per_sheet, face/back/edge_colour, cnc_tool_id, trim_*, pad, feed_rate_pct`)
  is one flat list, and each row is a full board.
- Role → material cascade: `assembly_schedule_rows` / `shop_material_defaults` →
  `job_materials` → `room_materials` → cabinet `material_overrides` JSONB
  (`{ role: material_id }`), all resolved in `src/lib/resolver/loadCabinetInput.ts`.
- Everything downstream keys on `material_id`: persisted part rows, optimiser
  sheets and margins (`src/lib/optimiser/store.ts`, `types.ts buildMargins`),
  3D colours (`useMaterialColours.ts` → `panelFaceColors`), and reports. There are
  21 `from('materials')` readers across 17 files.
- Doors already use a board+colour pattern: Door Blanks + Colour Ranges, where
  `door_schedule_materials.material_id` links each door colour to a board.
- `edge_banding.material_match_id` already exists (tape ↔ material link).
- Known gap (material schedules audit): material overrides don't swap the edgeband.

## 2. Core decision — a colour IS a material row (child of a board)

**Proposed.** Each colour is stored as a `materials` row with `parent_id` → its board.

- **Downstream code is unchanged.** The resolver, persisted parts, optimiser,
  margins, 3D colours and reports all still see one `material_id` per part. A
  colour id is a material id, so **nesting splits by colour automatically**, with
  no new grouping key.
- **The library UI hides the child rows.** The Materials tab lists boards
  (`parent_id is null`). Each board expands to its colour list, so the user
  manages one board and not hundreds of materials.
- **Colour rows inherit board fields.** A trigger copies the board's
  `dz, brand, cnc_tool_id, trim_*, pad, feed_rate_pct` into its colours, and also
  `sheet_dx/dy, cost_per_sheet` unless the colour overrides them. Editing the
  board updates every colour. Overridden fields are listed in
  `materials.overridden text[]`.
- **The name is generated automatically.** The trigger sets the colour row's
  `name = '<board name> – <colour_name>'`, so the 17 existing readers print
  `LX Colour 16mm Matt – Natural Walnut` with no code change.

Rejected alternative: a separate `board_colours` table plus a `colour_id` column on
every part table, the optimiser key and report. It is cleaner on paper but touches
every material consumer.

### Columns added to `materials`

| column | purpose |
|---|---|
| `parent_id uuid null` → materials | null = board; set = colour of that board |
| `colour_name text` | e.g. `Natural Walnut` |
| `colour_code text` | supplier code |
| `price_group text null` | supplier price tier (optional, §7 Q4) |
| `is_default_colour bool` | the board's fallback colour (§5) |
| `overridden text[]` | inherited fields this colour overrides |

Each colour row keeps its own `face_colour`, `back_colour`, `edge_colour`,
`has_grain`, `grain_direction` and `finish`.

### Back face

**`back_colour` null = same as face.** The 3D view, part editor and drawer-box view
treat a missing back as the face colour, not white. Set `back_colour` only for a
backer board (e.g. colour face / white back). This covers Laminex decor boards,
which are normally the same both sides.

### Edge tape per colour

A colour's matching tape is the `edge_banding` row whose `material_match_id` = the
colour. When a role resolves to a colour with a matching tape, the resolver uses
that tape. Otherwise it falls back to the schedule row's `edgeband_id`. This also
fixes the audit's "overrides keep the old edgeband" gap for colour swaps.

## 3. Library UI (Library → Materials)

- The **Boards** list shows only parent rows, with the existing columns. Each row
  gets a "N colours" chip and expands to its colour table.
- The **colour table** has: colour name, code, face / back / edge swatches, grain
  tick, matching tape, price group, and sheet size / cost overrides (blank =
  board's).
- **CSV import** of a supplier colour list into a board (name, code, grain, hex).
- A board with **no colours** keeps working as it does today: a plain board used
  directly, e.g. Whiteboard 16.5, MDF 18.

## 4. Job colour palette

A new table, `job_colour_slots`:

`id, project_id, slot_no int, label text (default 'Colour N'), material_id uuid → materials`

`material_id` must be a colour row, or a board with no colours.

- **Job Properties → Colours tab.** Add, remove and reorder slots. Each slot picks
  a board, then a colour. Unlimited slots.
- **Roles point at slots.** `job_materials` and `room_materials` gain
  `colour_slot_id uuid null`. When it is set, it wins over `material_id`. Cabinet
  `material_overrides` values may be `slot:<uuid>` as well as a material id.
- **Swapping a slot's colour re-resolves every cabinet using it.** This is the
  "change Walnut to Oak once" workflow.
- The palette is **job-level**. Rooms pick from the job's palette and don't keep
  their own (§7 Q1).

## 5. Resolver rules

The cascade order is unchanged: shop → job per-class → job → room → cabinet.

1. If the effective pick is a slot, it becomes the slot's `material_id`.
2. If the pick is a **board that has colours**, which happens when a shop default
   or assembly schedule names the generic board, the resolver uses that board's
   `is_default_colour` row and adds the warning **"colour not chosen"**. That
   warning shows in the error list and reports, so an unpicked colour never nests
   silently. If the board has no default colour, the resolver throws a hard error,
   matching the "exposed row required" rule.
3. Edgeband: the colour's matched tape, else the schedule tape (§2).
4. Persisted parts store the colour's `material_id`. Jobs stay static as built,
   following [[job-version-pinning-model]].

## 6. Phases

- [x] **MC0** Data fix: `LX Colour 16mm` back colour set to its face colour (2026-10-24).
- [ ] **MC1** Schema: §2 columns, sync + name trigger, `back_colour` null = face in all renderers.
- [ ] **MC2** Library UI: boards list, colour sub-table, CSV import.
- [ ] **MC3** Migrate data: turn the generic boards (LX Colour, PT Colour Matt, PT Woodmatt, LX Abs Grain) into boards with colours; existing job refs stay valid.
- [ ] **MC4** Job palette: `job_colour_slots`, Job Properties → Colours tab.
- [ ] **MC5** Role pickers: job/room roles and cabinet overrides pick a slot or board+colour; resolver rules §5 + edgeband match.
- [ ] **MC6** Downstream check: optimiser splits by colour, cut lists / orders / costing show the colour name, colour-not-chosen warning surfaced.
- [ ] **MC7** Doors: door colours may point at board colours and door styles may take a palette slot (per §7 Q3).
- [ ] **MC8** Tutorial: "Job colours" (palette, swapping a colour, colour-not-chosen warning).

## 7. Open questions (Mark to lock)

1. **Palette level.** Job-only (proposed), or can a room add its own slots too?
2. **Default slots.** Should a new job auto-create Colour 1 = exposed and
   Colour 2 = interior from the shop defaults?
3. **Doors in the palette.** Should doors / drawer fronts pick a palette slot, so
   "Colour 1" drives panels and doors together? Or do door Colour Ranges stay
   separate, and longer-term merge into board colours?
4. **Pricing.** Cost per colour, or price groups (A/B/C tiers) on the board with
   each colour assigned a group?
5. **Colour lists.** Where should the first lists come from? A Laminex / Polytec
   CSV from Mark, or entered by hand?
6. **Board with colours named by a shop default.** Use the default colour plus a
   warning (proposed), or force a pick before the job can resolve?
7. **Other generic boards.** PT Colour Matt and PT Woodmatt also have white
   (`#ededed`) backs today. Are they double-sided too (back = face)?
