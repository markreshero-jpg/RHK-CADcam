# CAD Annotation Tool — Spec

Status: **A1 built 2026-10-18 (read-only plan canvas + Plan View report); A2 next.** All decisions below are Mark's
(2026-10-18). Open: how sheet notes react to cabinet revisions (decided at A7).

> History: this folder used to hold the original Shape Editor handoff (May 2026). That
> work moved to `z_part_shape_editor/` (M1–M8 done; optimiser track O1–O7 in
> `OPTIMISER-PHASE-PLAN.md`). The old files are in `superseded_shape_editor/` for
> reference only. **Do not build from them.** The live component is
> `src/components/ShapeEditor/ShapeEditor.jsx`.

---

## Goal

A general CAD markup tool **for annotations only**. Users type notes, draw arrows,
lines, boxes, clouds and manual dimensions on the drawings, and **these print on the
shop drawings**. Annotations never change cabinets, parts, the nest or G-code. They are
paper information only.

## Locked decisions (Mark, 2026-10-18)

1. **Three drawing types:** plan (canvas + Plan View report), elevations (canvas +
   Elevation Views report, one wall each) and cabinet sheets (Cabinet Sheets report).
2. **Paper-size sizing (annotative).** Text height, arrowheads, line weights, cloud bumps
   and dimension ticks are set in **paper mm**: 3.5mm text is 3.5mm on the printed page
   at 1:20 and at 1:50. **Positions** are in real mm in the view's frame (below), so an
   arrow keeps pointing at the same spot at every scale.
3. **v1 tools:**
   - **Text.** Point text: a multi-line note that runs from where you click. Can have a
     **leader** (polyline + arrowhead) pointing at something.
   - **Text box** (added 2026-10-18). Drag out a frame and the text wraps inside it.
     Same `text` kind with `geom.width`. The width is in **paper mm**, so it wraps the
     same at every print scale. Background and border wrap the frame.
   - **Arrow / line.** Standalone.
   - **Box / ellipse / cloud.** The cloud is a revision cloud: a rectangle or
     freehand polygon with arc bumps.
   - **Manual dimension.** Click two points, then drag out the offset. The value is
     measured live from the two points in real mm. This is separate from the
     automatic dimension chains (`z_dimension_rows/`).
4. **Annotations stay put.** They are fixed in their view's frame and don't follow
   cabinets or walls when those move. Attaching to objects is a possible later phase.
   Exceptions: an elevation note belongs to its wall, and a sheet note belongs to its
   cabinet (see Frames). If the owner is deleted, its notes go with it.
5. **Canvas preview scale.** Each room has an **annotation scale** (default 1:20, set
   in Room Properties and on the CAD ribbon). The canvas draws paper-mm sizes at that
   scale, so the screen matches a print at that scale. Printing at another scale keeps
   the paper sizes, so text can crowd or spread out. That's normal for annotative CAD.
6. **Print colour: an option, default black.** Each annotation has its own colours,
   which always show on the canvas. Plan View, Elevation Views and Cabinet Sheets each
   get a **"Print annotation colours"** toggle, off by default:
   - Off: annotations print black like the rest of the drawing (display-layers
     decision 3c-2). Solid backgrounds and fills become white or none.
   - On: annotations print in their own colours.

   The toggle only affects annotations. The rest of the drawing always prints black.
7. **Every style property is editable in the CAD tools.** Each is set per annotation
   from the ribbon (decision 9), never hard-coded:
   - **Colour** of line, text and arrowhead: one colour per item, chosen from a
     palette or a custom picker.
   - **Text:** size (presets 2.5 / 3.5 / 5 / 7 paper mm, **or a custom value**), bold,
     italic, underline, left / centre / right alignment, rotation (free, snaps to
     0/90/180/270), line spacing.
   - **Text background:** none, **mask** (knocks out to the paper colour), or **solid
     fill** in any colour, with adjustable padding.
   - **Text border:** none, box or rounded box, with its own colour, weight and dash.
   - **Lines and shapes:** weight (paper mm), dash (solid / dashed / dotted /
     dash-dot) and colour.
   - **Fill** for boxes, ellipses and clouds: none, solid colour, or a see-through
     tint with adjustable opacity.
   - **Defaults:** the last-used style becomes the default for the next item of that
     kind (per-user pref). A "reset to defaults" button sits on the ribbon.
   - Named style presets ("Red markup", "Site note") are **not in v1**. They're a
     possible later addition.
8. **Arrowheads: the full set.** Closed filled, closed open, open (V), dot, open dot,
   tick (architectural slash), square, and none. Each end (start / end) is set
   separately on lines, leaders and dimensions. Size is in paper mm (default 2.5).
9. **F7 = CAD mode.** A new **CAD** tool goes in the left sidebar (shortcut F7, after
   Fixtures F6, styled like the other tools). Turning it on shows a **ribbon bar under
   the Plan / Elevation / 3D tab row**, holding:
   - the tools: Select, Text, Leader, Line, Arrow, Box, Ellipse, Cloud, Dimension;
   - the style controls (decisions 7 and 8) for the active tool or the selection;
   - snap toggles (reusing the existing snaps: endpoint, midpoint, wall face, cabinet
     corner, grid) and the room's annotation scale.

   The ribbon works in Plan and Elevation and hides on 3D. F7 again or Esc closes
   it. While CAD mode is on, clicks go to the annotation tools, not to cabinets or
   walls. Outside CAD mode, clicking an annotation selects it and opens the ribbon.
   Single-letter tool shortcuts inside CAD mode (e.g. T for text, L for line) are
   chosen at A2 after checking the key map.
10. **Cabinet sheets: annotate on the sheet preview** in the Reports modal, with the
    same ribbon. Sheets are generated reports (`CabinetSheetSVG` scales each view to
    fit its box in page mm). Clicks are mapped back through that view's `place()`
    transform into cabinet-local mm, so notes survive layout or scale changes. This
    covers the front and side views only, not the 3D line view or the tables.
    **Open, to be decided at A7:** what happens to sheet notes when the cabinet is
    resized or revised. Options:
    - keep them at the same cabinet-local mm and flag them as stale, like stale part
      shapes;
    - scale them with the cabinet;
    - pin them to the cabinet revision.
11. **Undo.** Plan and elevation annotations join `useCanvasHistory` snapshots (as an
    optional list, like fixtures). The sheet preview gets its own small undo stack.

## Frames (where coordinates live)

| View | Owner | Frame |
|---|---|---|
| plan | room | Room mm, the same frame as walls and cabinet `pos_x/pos_y` |
| elevation | `wall_id` | Wall-local: `u` along the wall as drawn left→right in that wall's elevation, `z` up from the floor. **Verify against `ElevationSVG`'s cabinet x mapping at A6**, including back-face / island walls (see memories: back-face placement, island face convention). |
| cabinet_sheet | `cabinet_id` + `sheet_view` (`front` / `side`) | Cabinet-local mm in that orthographic view: `x` across, `z` up from the cabinet base |

## Data model

New table `room_annotations` (job data):

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| room_id | uuid → rooms, cascade | always set; makes loading one room a single query |
| view | text | `plan` / `elevation` / `cabinet_sheet` |
| wall_id | uuid null → walls, cascade | elevation only |
| cabinet_id | uuid null → cabinet_instances, cascade | cabinet_sheet only |
| sheet_view | text null | `front` / `side` (cabinet_sheet only) |
| kind | text | `text` / `line` / `rect` / `ellipse` / `cloud` / `dim` (arrow = line with arrowheads) |
| geom | jsonb | real mm in the view frame. text: `{at, rot, leader?: pt[]}` · line: `{pts}` · rect/ellipse: `{a, b, rot}` · cloud: `{pts}` (closed) · dim: `{p1, p2, offset}` |
| text | text null | the text kind's content; also a dim text override (e.g. "TBC") |
| style | jsonb | sizes in paper mm, plus colours: `{color, size, bold, italic, underline, align, lineSpacing, bg: none/mask/solid, bgColor, bgPad, border: none/box/round, borderColor, borderWeight, borderDash, weight, dash, fill: none/solid/tint, fillColor, fillOpacity, arrowStart, arrowEnd, arrowSize}`. All optional; missing keys use defaults. |
| sort_order | int | draw order |
| created_at / updated_at | timestamptz | |

- A check constraint ties `view` to its owner columns (elevation needs `wall_id`,
  cabinet_sheet needs `cabinet_id` + `sheet_view`).
- **RLS:** role-locked like every table since 2026-10-13 (admin/tester, no anon).
  Copy the `room_fixtures` policies. A new table without policies is invisible.
- Types go in `src/lib/types.ts` (`RoomAnnotation`). DB helpers go in `canvasDB.ts`
  next to the fixture helpers.
- Shared drawing logic goes in `src/lib/annotations/`: geometry such as cloud bumps,
  arrowheads, text box measuring, leader attach side and dim text. It is pure and
  unit-tested, so canvas, reports and sheets all draw from one place.
- Per-user last-used styles go in `userPrefs` (`annotStyleDefaults`, by kind).
  The room's annotation scale is a new `rooms` column (`annotation_scale`, default 20).

## Display layers (cross-module rule)

Register a new **Annotations** group in `src/lib/displayLayers/registry.ts`:

| id | covers | views | default |
|---|---|---|---|
| `annot_text` | text notes + their leaders | P, E | shown |
| `annot_markup` | lines, arrows, boxes, ellipses, clouds | P, E | shown |
| `annot_dims` | manual dimensions | P, E | shown |

- Gate every canvas and report render through `layers.show(id)`.
- Annotations keep their own colour, weight and dash. Layer style/colour does **not**
  override them; layers only show or hide them (and ghost them, if set).
- Reports already take a `LayerView`, so annotations follow the report's layer-set
  picker for free.
- Cabinet sheets are not driven by layer sets (they use `CabinetSheetLayers` toggles).
  Add an `annotations` toggle there instead, default on.
- Annotations are 2D only. They don't appear in 3D, so these items have no `3D` view.
- Existing shop sets: the new items default to shown, so every set (including
  "Kicks") will show annotations. Tell Mark at A1 and offer to hide them in Kicks.

## Rendering

- One renderer component (`AnnotationLayer`) takes:
  - the annotations;
  - a frame→SVG mapper;
  - a **paper scale factor** (model mm per paper mm): the room's annotation scale on
    the canvas, the report's `scale` on the plan / elevation reports (which already
    work in "physical mm × scale = model mm"), and the inverse of that view's
    `place()` scale on a cabinet sheet;
  - a `printColours` flag (decision 6).
- Draw order: annotations sit **on top** of everything else in the view, under the
  title block. Within annotations, `sort_order` decides the order (ribbon: bring to
  front / send to back).
- Text measuring has to be the same in the canvas and the PDF export. Use the
  reports' existing text approach and check one sample in the exported PDF at A2.

## Editing behaviour

- Select, move (drag), multi-select, delete, copy/paste and duplicate. Double-click
  text to edit it inline (positioned textarea).
- Grips: line/leader vertices, box corners, dim points + offset, text position, plus a
  rotate grip.
- Style for the selection is edited on the CAD ribbon. With several items selected,
  the ribbon edits their shared properties together.
- **Only what's shown is selectable** (layers rule). An annotation on a hidden
  `annot_*` item can't be picked.
- Outside CAD mode, annotations are clickable to select but don't block cabinet or
  wall drags.

## Known catches

- **Room copy / duplicate:** RoomManagement must copy `room_annotations`, remapping
  `wall_id` / `cabinet_id` to the new ids.
- **Wall split / rejoin / detach** changes wall ids. Elevation notes on the old wall
  would be cascade-deleted. Proposal: remap them to the surviving wall at split time
  (A6). If that isn't possible, warn before the operation.
- **Mirroring or rotating a room** (if that exists or is added later) would leave plan
  notes behind. That's acceptable for v1 (notes stay put), but note it in the tutorial.
- **Cabinet resize / revision** and sheet notes: open, see decision 10.
- **Mobile (z_mobile):** viewing must work. Authoring on the phone is out of scope
  for v1.
- **Tutorial:** add an "Annotating drawings" lesson at the end of the append-only list.

## Phases

| Phase | Scope | Status |
|---|---|---|
| A1 | Table + RLS + `rooms.annotation_scale`; types + DB helpers; layer items; `src/lib/annotations/` geometry + tests; `AnnotationLayer` read-only in the plan canvas + Plan View report (check with a hand-seeded row) | [x] built 2026-10-18; in-app check pending |
| A2 | Plan authoring: F7 CAD sidebar tool + **ribbon** under the view tabs, **Text** tool with full text styling (decision 7), colour picker, select/move/delete/copy, undo, snaps, last-used defaults, annotation scale on the ribbon; "Print annotation colours" report toggle; PDF text check | [ ] |
| A3 | **Arrow / line + text leaders** (full arrowhead set per end, dash types, weight, vertex grips) | [ ] |
| A4 | **Box / ellipse / cloud** with fill (none / solid / tint) | [ ] |
| A5 | **Manual dimension** (live value, text override, offset grip, arrowhead/tick ends) | [ ] |
| A6 | **Elevations:** wall-local frame, canvas + Elevation Views report, wall-split remap | [ ] |
| A7 | **Cabinet sheets:** ribbon on the sheet preview (decision 10), cabinet-local frame, sheet toggle, own undo; **decide the cabinet-revision behaviour first** | [ ] |
| A8 | Room copy remap, tutorial lesson, mobile view check | [ ] |

## RESUME HERE

**A1 built 2026-10-18.** Migration `cad_a1_room_annotations` applied live (SQL in
`migration_a1_room_annotations.sql`).
- Files: `src/lib/annotations/{style,geometry}.ts` (17 tests in
  `src/lib/__tests__/annotationGeometry.test.ts`), `app/canvas/[roomId]/AnnotationLayer.tsx`
  (the one renderer), and `canvasDB.ts` helpers (`dbLoadAnnotations` /
  `dbInsertAnnotation` / `dbUpdateAnnotation` / `dbDeleteAnnotations`).
- Wiring: `page.tsx` loads the rows → CanvasClient `annotations` state (no setter yet)
  → CanvasSVG `annotationsLayer` (after fixtures). ReportsModal → PlanViewReport →
  PlanViewReportSVG draws them above the chains, under the title block, and fits the
  viewBox to them. They print black until A2 adds the colour toggle.
- Test data: 8 sample rows (one of each kind + a second arrow) on **Test Kitchen →
  "Void Corner Demo"** (room `edb6c46b…`). Delete them once A2 can author real ones.
- Verified by rendering `AnnotationLayer` to static SVG and screenshotting, in colour
  and print-black. Not yet seen inside the running app: headless sign-in needs
  `AUTOMATION_*` in `.env.local`.
- Layer Manager shows its normal colour / weight controls on the annot items. They do
  nothing (annotations keep their own style); hide them there in A2 if it confuses.

Next: A2 (F7 CAD mode + ribbon + Text / Text box tools).
