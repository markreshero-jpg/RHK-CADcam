# CAD Layers — named layers for the F7 CAD items

**Status:** L1–L4 built 2026-10-28, canvas parts checked headless. In-app check by Mark pending.

AutoCAD-style named layers (Electrical, Plumbing, Site notes…) for the CAD items: text,
markup, dimensions and CAD blocks on plan, elevation and cabinet sheets. Each layer can
be turned on and off, has a colour its items use by default, and can be set not to print.

Builds on: `z_CAD_tool/ANNOTATION-SPEC.md` (the CAD tool, `room_annotations`,
`AnnotationLayer`), `z_display_layers/DISPLAY-LAYERS-SPEC.md` (the layer registry and
layer sets), and job pinning (`z_item_cad` decision 4: library changes never reach a job
by themselves).

## Locked (Mark, 2026-10-28)

1. **Named layers, from a shop-wide list, kept per job.** The shop keeps one standard list
   (Settings). Each job gets its own copy, and the job can add, rename or delete its own
   layers without touching the shop list.
2. **On/off is for the whole job.** Turning Electrical off hides it for everyone on that
   job, on the canvas and in every report, like an AutoCAD drawing.
3. **ByLayer colour.** Each layer has a colour. New items on a layer use it unless the user
   picks another colour. Changing the layer's colour recolours its ByLayer items.
4. **CAD items only.** Cabinets, fixtures, walls and so on stay on display layer sets.
5. **Don't print.** Each layer has a print switch. A no-print layer shows on the canvas
   but stays off every report (Plan View, Elevation Views, shop drawings, cabinet sheets).
   No lock switch.

## Defaults (Claude, 2026-10-28; Mark to overrule)

- **Layer "0" / General.** Every job has one default layer, **General**. It can be renamed
  and recoloured but not deleted. Every existing CAD item sits on it (`cad_layer_id` null
  = General), so nothing changes on old drawings.
- **Starter shop list:** General (red, the colour CAD uses today), Electrical (amber),
  Plumbing (blue), Gas (green), Site notes (purple), Construction (grey, **don't print**,
  for working lines). Edited in Settings → CAD Layers.
- **Pinning.** The first time a job opens without layers, it copies the whole shop list.
  After that, shop edits never reach the job. Job layer manager → **Add from shop list**
  adds shop layers the job doesn't have yet (the explicit "Update job" step for layers).
  When the general Update job screen exists, this joins it.
- **Both gates apply.** An item shows only if its display layer item (`annot_text` /
  `annot_markup` / `annot_dims`, from the active layer set) is shown **and** its CAD
  layer is on. Layer sets keep deciding *what kind* of CAD shows in a view; CAD layers
  decide *which subject*. This is the Annotations group's own sub-layering, not an ad-hoc
  flag: the renderer applies it in the same place as the layer set (see display layers
  spec).
- **Off = not selectable, not snapped to.** Items on an off layer drop out of selection,
  marquee, Ctrl+A and CAD snaps, like the display-layer rule.
- **What ByLayer covers.** `style.color` unset = the layer's colour. `borderColor` and
  `fillColor` unset follow the layer colour too (today they default to the same red, so
  old items look the same). Picking a colour on an item sets it explicitly; the colour
  picker gets a **ByLayer** swatch to clear it.
- **New items are ByLayer.** The remembered per-user style no longer carries `color`,
  `borderColor` or `fillColor` unless the user picked one on purpose since this change
  (old remembered colours are dropped once).
- **Print colours off** (ANNOTATION-SPEC decision 6) still prints everything black.
  ByLayer only changes the screen and colour prints.
- **Current layer.** The CAD panel has a **Layer** dropdown. With nothing selected it sets
  the layer new items go on (remembered per user per job). With items selected it shows
  their layer and changing it moves them (one undo step). The right-click menu gets
  **Move to layer ▸** as well.
- **Layer list in the CAD panel.** Each row: on/off eye, colour swatch, name, print icon.
  Click a name to make it current. **Manage…** opens the job layer manager: add, rename,
  recolour, reorder, delete, Add from shop list. Deleting a layer moves its items to
  General (asks first).
- **Off layers stay off in reports with no extra picker** (decision 2). A report's layer
  set still applies on top.
- **Library CAD** (item CAD, CAD blocks): item CAD from the library draws on General.
  Inserting a CAD block puts its items on the current layer. Layers inside library CAD
  are a later phase, if wanted.
- **Undo.** Moving items between layers goes through the normal canvas undo. Layer on/off,
  colour and renames are job settings, not undone (like the layer set picker).

## Data model

`cad_layers` (shop list, library RLS: read all, admin write):

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text | unique |
| color | text | hex |
| visible | bool | default on, copied into new jobs |
| print | bool | default true |
| is_default | bool | the General row; exactly one |
| sort_order | int | |
| created_at / updated_at | timestamptz | |

`job_cad_layers` (job data, `can_access_project` RLS like `job_item_cad`):

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| project_id | uuid → projects, cascade | |
| shop_layer_id | uuid null → cad_layers, set null | where it came from; unique per project (stops a double copy) |
| name, color, visible, print, is_default, sort_order | | as above |

`room_annotations.cad_layer_id` uuid null → `job_cad_layers`, on delete set null
(null = General).

Pure helpers in `src/lib/annotations/cadLayers.ts`: copy shop → job rows, the
`CadLayerView` (`show(a)`, `printable(a)`, `color(a)`) the renderer takes, and the
ByLayer colour fill-in used by `resolveStyle`.

## Phases

| Phase | Scope | Status |
|---|---|---|
| L1 | Tables + RLS + starter shop list + `cad_layer_id`; types; `cadLayers.ts` + tests; copy on first open; renderer: on/off + ByLayer colour on canvas, print switch on Plan View / Elevation Views / shop drawings / cabinet sheets; off layers out of select / marquee / snaps | [x] built 2026-10-28 |
| L2 | CAD panel: Layer dropdown (current layer / move selection), layer list (eye, colour, print), ByLayer swatch in the colour picker, right-click Move to layer; new items ByLayer | [x] built 2026-10-28 |
| L3 | Job layer manager (add / rename / recolour / reorder / delete → General / Add from shop list) + Settings → CAD Layers (shop list editor) | [x] built 2026-10-28 |
| L4 | Tutorial + headless check (layer off hides on canvas + report, no-print layer, ByLayer recolour) | [x] built 2026-10-28; canvas checked headless, reports not yet |

## Build notes (2026-10-28)

- Migration `cad_layers_l1` applied live (`migration_l1_cad_layers.sql`): `cad_layers` (seeded
  with the starter list), `job_cad_layers`, `room_annotations.cad_layer_id` (on delete set null).
- Pure: `src/lib/annotations/cadLayers.ts` (`jobRowsFromShop`, `ensureJobCadLayers`,
  `cadLayerView`, `annotationsForPrint`). `resolveStyle(kind, style, layerColor)` fills ByLayer
  colours. Tests: `src/lib/__tests__/cadLayers.test.ts`.
- Copy on first open: `app/canvas/[roomId]/page.tsx` calls `ensureJobCadLayers` (server side).
- Canvas: `AnnotationLayer` takes `cadLayers` (+ `printing`). `CanvasClient` holds the job's
  layers and the current layer (`userPrefs.cadLayerCurrent[projectId]`). It keeps off layers
  out of snaps, and out of marquee / Ctrl+A (`useAnnotationTool` `selectable`), and drops
  hidden items from the selection.
- Reports: `ReportsModal` runs every room's annotations through `annotationsForPrint`, which
  drops off and no-print layers and writes the ByLayer colours in. Plan View, Elevation Views,
  shop drawings and cabinet sheets all follow it. Item CAD from the library draws on General.
- UI (`app/canvas/[roomId]/CadLayers.tsx`): `CadLayersSection` at the top of the CAD panel,
  `CadLayerManagerModal`, and `ShopCadLayers` (Settings → Library → CAD Layers, read-only for
  testers). The ribbon has a Layer picker (sets the current layer, or moves the selection) and a
  ByLayer swatch. Right-click → Move to layer.
- Remembered CAD colours were dropped once (`userPrefs.cadByLayerV1`), so new items are ByLayer.
- Tutorial `cad_layers` (events `cad_layer`, `cad_layer_toggle`).
- Headless check `z_plan_automation/verify-cad-layers.mjs` (RHK1234 test room) cleans up after
  itself and confirmed:
  - the shop list is copied into the job;
  - three boxes draw red / blue / grey ByLayer;
  - the Plumbing eye hides its box and saves `visible=false`;
  - the picker and the manager open.

  **Not checked yet:** report output with a no-print layer, Move to layer (right-click and
  ribbon), the Settings tab, undo of a move.
