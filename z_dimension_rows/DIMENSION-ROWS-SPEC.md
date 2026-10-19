# Dimension Rows — User-Defined Dimension Chains

Status: **Spec agreed in principle, not started** (P0 quick fixes done)
Date: 2026-10-12
Related: `z_display_layers/DISPLAY-LAYERS-SPEC.md` (rows live inside layer sets and
must go through the layer API).

## Goal

Replace the fixed dimension chains with rows the user defines per layer set. Each row
measures every cabinet of the classes it is set to (e.g. "Overheads + talls", "Base"),
along every wall, in plan and elevation.

Today's fixed chains:

| View | Item | Measures |
|---|---|---|
| Plan | `dim_wall_chain` | wall + wall_corner (+ tall + tall_corner since the P0 quick fix) |
| Plan | `dim_base_chain` | base + base_corner |
| Plan | `dim_wall_overall` | wall length |
| Elevation | `dim_elev_wall_chain` | wall + wall_corner, above the elevation |
| Elevation | `dim_elev_floor_chain` | base + tall (+ corners), excluding kick assemblies, below |
| Elevation | *(not a layer item)* | overall wall length, hard-coded, always shown |
| Elevation | `dim_elev_height` | vertical height chain (left side) — **out of scope, stays as is** |

## Locked decisions (user, 2026-10-12)

1. **Plan and elevation** both use rows.
2. **No per-wall hiding.** A row applies to every wall in the room.
3. **No partial rows.** A row measures all matching cabinets along the wall.
4. **Panels, fillers, bulkheads etc. are measured by their class.** They are cabinet
   instances that carry `assembly_class` (base / wall / tall), so a base filler sits in
   any row that measures base, a tall end panel in any row that measures tall, etc.
   No separate "panel" filter. Custom parts inside a cabinet's assembly
   (`cabinet_custom_parts`) are never dimensioned (see Known catches #2).
5. **Talls go on the plan overhead row** as an interim fix until rows land (done).

## Decisions proposed by Claude (confirm or change)

- **Rows are per view** (plan list and elevation list are separate). Each view tab in
  the Layer Manager already has its own settings, and elevation rows need a top /
  bottom position that plan doesn't.
- **Corners fold into their class**: picking "base" includes `base_corner`, etc.
- **Kick assemblies and benchtops are never in a row.** They have their own items: kicks = `dim_kicks` (built 2026-10-15, stays a fixed item, not a row); benchtops = none yet.
- **Overlap within a row** (e.g. a row measuring base + wall, where they overlap along
  the wall): the row measures the **union** of their extents, so segments never
  overlap. Overlapping cabinets merge into one segment.
- **Empty rows collapse** on a wall that has nothing to measure. The rows outside move
  in so there are no empty gaps.
- **Overall wall length** stays a fixed item, always the outermost row. Elevation gets
  a new gated item `dim_elev_overall` (the current hard-coded dim breaks the
  display-layers rule).
- **Spacing**: rows stack one `dimStep` apart (150mm, clamped 18–50 screen px — see
  `WallDimensionChain.tsx`). Row 1 sits nearest the wall.

## Data model

Rows are stored inside the layer set, in `drawing_layer_sets.settings`. **No migration.**

```ts
ViewLayerSettings = {
  items?: {...}, lineDrawing?, background?,
  dimRows?: DimRow[]          // NEW — plan + elevation only. Undefined = legacy defaults
}

interface DimRow {
  id: string                  // uuid; stable for React keys + editing
  name: string                // "Overheads + talls"
  classes: ('base' | 'wall' | 'tall')[]   // corners included automatically
  gaps: boolean               // true = also measure gaps between cabinets + to wall ends (today's behaviour)
  depthDims?: boolean         // plan only: perpendicular depth dims at the wall ends (default true)
  position?: 'top' | 'bottom' // elevation only. Default: 'top' if classes = ['wall'], else 'bottom'
  // Style — same fields and semantics as ItemSetting
  visible: boolean
  style: LayerStyle
  color?: string
  weight?: number
  opacity?: number
}
```

**Legacy synthesis** (like `SPLIT_FROM` for shelves): when `dimRows` is undefined, the
resolver builds the default rows from the old item settings, inheriting their style:

- Plan: `Overheads + talls` (wall + tall, from `dim_wall_chain`), `Base` (from `dim_base_chain`).
- Elevation: `Overheads` (wall, top, from `dim_elev_wall_chain`), `Floor` (base + tall,
  bottom, from `dim_elev_floor_chain`).

The old item ids stay in the registry, hidden from the manager. **Never reuse them.**
The first save from the manager writes `dimRows` explicitly.

**Layer API**: `LayerView.dimRows(): ResolvedDimRow[]` (only rows set to visible, with
defaults filled in). Renderers never read `settings.dimRows` directly.

## Shared logic — `src/lib/dimensionRows.ts`

- `rowCabinets(row, cabs, wall)`: filter by class (corner-folded), excluding kick
  assemblies. Callers pass cabinets already filtered by `planShowsCabinet` /
  `elevationShowsCabinet`, as today.
- `computeRowChain(cabs, wall, gaps)`: replaces the three copies of `computeChain` /
  `computeElevChain` (WallDimensionChain, PlanViewReportSVG, ElevationSVG /
  ElevationPrintSVG). Unions overlapping extents. Unit tests cover overlap, gaps
  on/off, the empty wall, and cabinets touching the wall ends.
- `rowDepth(cabs)`: deepest `dz`, for the plan depth dims.

## Rendering

- **Plan canvas + plan report**: visible rows with cabinets on this wall side, in
  order, at `depthOffset + step × n`. Then overall. Each row with `depthDims` draws its
  wall-end depth dims on its own lane (`lane = row index`), clear of the return wall.
  Lanes whose depth matches the previous lane within 5mm are skipped (today's rule).
  This applies to both island and back-side cabinet sides (`renderSide`).
- **Elevation canvas + print**: `top` rows stack upward from the top of the elevation,
  and `bottom` rows downward from the floor line. `dim_elev_overall` is outermost at
  the bottom.

## Layer Manager UI

The Plan and Elevation tabs get a "Dimension rows" section in the Dimensions group:
- Each row has a show/hide eye, a name (editable inline), class chips (Base / Wall /
  Tall), a gaps toggle, depth dims (plan) or a top/bottom switch (elevation), and the
  usual colour / weight / style / opacity controls.
- Rows have reorder buttons (up / down) and delete. "+ Add row" adds a new row.
- Edits preview live, like every other item.

## Known catches

1. ✅ **Fixed (P0, 2026-10-12)** — the quick "Panel / Filler Left / Right" insert
   (`useCabinetOps.handleInsertAdjacent`) always created `assembly_class: 'base'`. A
   filler next to an overhead landed on the base row. It now inherits the host's class
   (corner folded) and `pos_z`, and labels fillers `FL-xx` instead of `EP-xx`.
2. ✅ **Decided (user, 2026-10-12) — custom parts are never dimensioned.** A panel or
   filler that should be measured is placed as its own assembly (a separate cabinet
   instance, e.g. via the adjacent insert or the library), and rows pick it up by
   class. The only way to put a panel / filler *onto* a cabinet is a custom part
   inside that cabinet's assembly (Cabinet Edit modal → `cabinet_custom_parts`). That
   is part of the cabinet, so rows ignore it in plan and elevation: the row neither
   stretches the cabinet's segment nor adds a segment for it.

## Phases

| Phase | Scope | Status |
|---|---|---|
| P0 | Plan: talls on the overhead row; depth-dim lanes + return-wall clearance; fixed-mm spacing. Adjacent insert inherits class | ✅ 2026-10-12 |
| P0b | Plan canvas + plan report: row names (BASE / WALL CABS / TALL / WALL + TALL / BULKHEAD / KICK / OPENINGS / OVERALL) just past each row's wall-start end, layer item `dim_row_labels` (`dimLabel.tsx` `wallRowName`). **P2: draw `row.name` there instead.** | ✅ 2026-10-19 |
| P1 | `DimRow` type, `dimRows` in settings, legacy synthesis, `LayerView.dimRows()`, `dimensionRows.ts` + tests | — |
| P2 | Plan canvas + plan report driven by rows | — |
| P3 | Elevation canvas + print driven by rows; `dim_elev_overall` item | — |
| P4 | Layer Manager rows UI | — |
