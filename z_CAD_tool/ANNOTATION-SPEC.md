# CAD Annotation Tool — Spec

Status: **A1–A5 built (plan: every v1 tool — text / text box / leader / line / arrow / box / ellipse / cloud / dimension). A2–A4 checked in-app by Mark; A5 check pending; A6 (elevations) next.** All decisions below are Mark's
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

### Feedback round (Mark, 2026-10-19, after using A1–A5) → phases B1–B5, before A6

12. **Everything now, before elevations.** A6 reuses the same hook, ribbon and
    renderer, so behaviour changes go in on the plan first and elevations inherit them.
13. **Snapping:** all CAD tools snap to cabinets, walls, door fronts, appliances,
    benchtops and the annotations themselves (CAD-style object snaps). Snapping
    never attaches a note to an object; decision 4 still holds.
14. **Click, click.** Box / ellipse / cloud / text box start on one click and finish
    on the next (a drag still works too). Text boxes take their width **and**
    height from that frame before typing.
15. **Leader note bug:** after placing a leader the text couldn't be typed. Cause:
    the editor opened on pointerdown, then the browser's default mousedown focus
    move blurred it, so it committed empty and was discarded.
16. **Arcs:** 3-point, centre-start-end and start-end-radius, plus a **circle** tool.
17. **Offset tool** (new parallel copies of lines, boxes, etc.), and **dragging a side**
    of a line / box / cloud parallel, with the sides next to it stretching.
18. **Dimensions:** linear + aligned (have), plus **angular, radius / diameter, arc
    length, continue and baseline**.

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
| A2 | Plan authoring: F7 CAD sidebar tool + **ribbon** under the view tabs, **Text** tool with full text styling (decision 7), colour picker, select/move/delete/copy, undo, snaps, last-used defaults, annotation scale on the ribbon; "Print annotation colours" report toggle; PDF text check | [x] built 2026-10-18; in-app check pending (PDF text check not done yet) |
| A3 | **Arrow / line + text leaders** (full arrowhead set per end, dash types, weight, vertex grips) | [x] built 2026-10-18 (1865f72); in-app check pending |
| A4 | **Box / ellipse / cloud** with fill (none / solid / tint) | [x] built 2026-10-18; in-app check pending |
| A5 | **Manual dimension** (live value, text override, offset grip, arrowhead/tick ends) | [x] built 2026-10-19; in-app check pending |
| B1 | **Feedback fixes:** leader typing bug; click-to-start / click-to-finish for box / ellipse / cloud / text box (drag still works); text box sized in width **and** height before typing (`geom.height`, corner grip); cloud rectangle / freehand ribbon option | [x] built 2026-10-19; in-app check pending |
| B2 | **CAD snaps:** end / mid / centre / nearest-on-edge / intersection / perpendicular, on walls (faces + corners), cabinets (footprint + door / drawer front line), fixtures & appliances, benchtops and annotations; snap glyph; ribbon toggles | [x] built 2026-10-19; in-app check pending |
| B2b | **Measurements + coordinates:** live length / angle while drawing, W × H while placing, side lengths / W × H on the selection (screen only); cursor X / Y + ΔX / ΔY readout; typed Length / Angle (2-point line) and W / H (box, ellipse) on the ribbon | [x] built 2026-10-19; in-app check pending |
| B2c | **CAD side panel** (right, while F7 is on, plan): cursor X / Y / Δ / distance / angle; the shape being drawn point by point; the selection's numbers, editable (points, corner, W / H, rotation, text box size, leader, dim points + offset); multi-select extents; objects list to pick from | [x] built 2026-10-19; in-app check pending |
| B2d | **Typed entry (Tab):** while drawing, Tab (or a digit) jumps to the CAD panel's size fields — Length / Angle for a segment, W / H for a box / ellipse / cloud / text box, Offset for a dim's last step; Enter places, Esc clears | [x] built 2026-10-19; in-app check pending |
| B2e | **Self snaps:** a line / arrow / cloud / leader being drawn snaps to its own earlier points, segments and midpoints (close back on the start); a dragged vertex snaps to the rest of its own shape | [x] built 2026-10-19; in-app check pending |
| B3 | **Arcs + circle:** kinds `arc` + `circle` (migration); arc by 3-point, centre-start-end, start-end-radius; circle by centre + radius; grips | [x] built 2026-10-19; in-app check pending |
| B4 | **Offset tool + side drag:** offset a line / polyline / box / cloud / arc / circle / ellipse by cursor or typed distance (repeats); drag one side of a line / box / cloud parallel with the neighbours stretching | [x] built 2026-10-19; in-app check pending |
| B4b | **Fillet / chamfer / join + right-click menu:** two picks (two sides of a line → that corner; two lines → trim / extend to meet and join); a box = all corners; Join nearest ends / close; lines gain arc segments (bulges) + closed outlines; right-click menu on any note / line | [x] built 2026-10-19; in-app check pending |
| B5 | **More dims:** angular, radius / diameter, arc length, continue + baseline chains | [x] built 2026-10-20; in-app check pending |
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

**A2 built 2026-10-18** (not yet seen in the running app: the Chrome extension can't
reach localhost and there's no `AUTOMATION_*` login for headless runs).
- **Mode:** `Mode` gained `'cad'`. F7, the sidebar **CAD** header (rose tone, after
  Fixtures) and the ribbon ✕ toggle it. While on, an invisible full-canvas rect
  inside `annotationsLayer` takes left clicks (tools / marquee). Wheel, pinch and
  right-drag pan still reach the svg.
- **Files:** `useAnnotationTool.ts` (tools, selection, drags, editor state,
  clipboard, keys), `CadRibbon.tsx`, `AnnotTextEditor.tsx` (fixed-position
  textarea styled like the drawn text). `AnnotationLayer` gained `edit` props (hit
  areas, selection outline, rotate + text-box width grips).
- **Keys** (capture-phase listener, CAD mode only, ignored in inputs):
  - S / T / B pick Select / Text / Text box.
  - Del deletes the selection.
  - Ctrl+C / Ctrl+V copy and paste (pasted copies sit 5 paper mm down-right);
    Ctrl+D duplicates; Ctrl+A selects all.
  - Enter edits the selected text.
  - Esc clears the selection, then drops back to Select, then exits CAD.
  - Ctrl+Z / Y fall through to the shared canvas undo; annotations are in
    `useCanvasHistory` snapshots.
- **Text tool:** click = point text. Text box tool: drag = a box whose width is in
  paper mm (a drag narrower than 8 paper mm makes point text). In the editor, Enter
  is a new line; Ctrl+Enter, a click away, or blur finishes. Esc cancels. An empty
  new note is discarded; emptying an existing one deletes it.
- **Moving and rotating:** placement and moves snap with the canvas snap settings
  (Shift = free). Rotation is about the block's top-left `at`, snapping to quarter
  turns within 4° (Shift = free).
- **Plain select mode:** clicking an annotation opens CAD mode on it (decision 9);
  double-click edits.
- **Ribbon:**
  - Colour palette + picker.
  - Text: size presets / custom, B / I / U, alignment, line spacing, rotation.
  - Background: none / mask / solid + colour + padding.
  - Border: none / box / round + colour / weight / dash.
  - For the A1 seeded kinds: line weight / dash, arrowheads per end + size, fill
    none / solid / tint.
  - Front / back, delete, reset.
  - Room annotation scale (writes `rooms.annotation_scale` directly; deliberately
    not `handleUpdateRoom`, which re-resolves every cabinet).
  - Edits apply to the selection or the edit in progress, and become that kind's
    default (`userPrefs.annotStyleDefaults`). Buttons keep focus, so the editor
    stays open.
- **Plan View report:** new "Annotation colours" page toggle (default off = black).
- **Elevation:** the ribbon shows there with a note that elevation annotations come
  in A6; tools are disabled.
- **Known rough edges:**
  - Rotated box / ellipse selection outline is axis-aligned.
  - The editor textarea's baseline sits within about 1px of the drawn text, not
    exact.
  - Layer Manager still shows its colour / weight controls on the annot items.
  - Annotation text drawn in black is hard to see on the dark canvas.

A2 checked in-app by Mark 2026-10-18 ("looks good").

**A3 built 2026-10-18** (1865f72; in-app check pending).
- **Tools:** Leader (Q), Line (L), Arrow (A); their ribbon buttons are now live.
  - Line / Arrow: click points. Double-click, Enter or right-click finishes;
    Backspace steps back a point; Esc cancels. A rubber-band preview draws through
    `AnnotationLayer`. Arrow = a `line` row with `arrowEnd: 'closed'` (`ARROW_TOOL`).
  - Leader: click the tip, then click the landing. The text editor opens just past
    the landing (`leaderTextAt`), and the row is a `text` with `leader: [tip, landing]`.
- **Snapping:** a point uses the canvas snap. If nothing snaps, the segment from the
  previous point locks to 15° within 4° (`angleSnap`). Shift = free.
- **Remembered styles:** lines remember their style apart from arrows
  (`StyleKey = kind | 'arrow'`, `styleKeyOf`; `userPrefs.annotStyleDefaults` keyed by
  StyleKey). The arrow defaults are `ARROW_TOOL` + saved.
- **Grips** (single selection): every vertex of a line or leader is a draggable
  circle; segment midpoints are diamonds that insert a vertex once dragged.
  `AnnotGrip` = `rotate | width | v<N> | m<N>`.
- **Ribbon, Leader group** (text):
  - leader arrowhead, size and line weight when the text has a leader;
  - **+ Add** (next click = tip, `leader: [tip]`) / **Remove** for a single selected
    text;
  - a hint line while drawing.
- `8f776b0` (tutorial session) committed the A3 ribbon before its hook; 1865f72
  restored a consistent main.

A3 checked in-app by Mark 2026-10-18.

**A4 built 2026-10-18** (in-app check pending).
- **Tools:** Box (R) and Ellipse (E): drag corner to corner, with a live preview of
  the real shape. Cloud (C) works two ways:
  - drag = a rectangular cloud (`rectPts`, stored as `pts`);
  - click without dragging = start a freehand cloud: click the corners;
    double-click / Enter / right-click closes it (3+ points). This reuses the line
    drawing path (`AnnotDrawing.tool = 'cloud'`).
- **Grips** (single selection):
  - unrotated box / ellipse: 4 square corner grips (`c0–c3`, `setBoxCorner` keeps the
    opposite corner). Rotated ones move / rotate only.
  - cloud: vertex grips, plus midpoint diamonds that include the closing segment.
- **Ribbon:** a "Turn" rotation field for a single box / ellipse (rotates about the
  centre; `applyRotation` now covers them), and "Arcs" (new style key `cloudBump`,
  paper mm, default 6) for clouds. The Fill group (none / solid / tint) was already
  there from A2.

A4 checked in-app by Mark 2026-10-19.

**A5 built 2026-10-19** (in-app check pending).
- **Tool:** Dimension (D). Click point 1, click point 2, move to pull the dim line out,
  then click (or Enter) to place it. Points use the canvas snaps (cabinet corners,
  wall ends…); the placing move snaps too, but with no 15° lock.
- **Modes** (ribbon "Dim" group, per session, for new dims):
  - **Linear** (default): `DimGeom.axis` 'x' / 'y'. The axis is picked from where
    the line is pulled (`dimAxisFor`, DIMLINEAR-style: above / below = horizontal,
    beside = vertical; sticky while the cursor is between the points). The offset is
    then a y- / x-offset from p1.
  - **Aligned:** no axis, as in A1.
- **Text override:** ribbon field for a single selected dim. Blank = the measured
  value; `<>` stands for it (`dimText`: "<> TBC" → "600 TBC").
- **Text:** the size picker is in the Dim group. Vertical dim text now reads
  bottom-to-top (`readableAngle` range is [-90, 90)).
- **Grips:** p1 / p2 vertex grips (no midpoint inserts), plus a bar grip on the dim
  line that slides its offset (`'offset'` grip, `dimOffsetFor`, axis kept).
- Verified by a static render: linear horizontal + vertical with override, and
  aligned.

**B1 built 2026-10-19** (in-app check pending).
- **Leader fix:** `onCaptureDown` now `preventDefault()`s, so the browser's mousedown
  focus move can't blur an editor that click just opened. `AnnotTextEditor` also
  re-focuses on the next frame and ignores a blur in its first 250 ms.
- **Click-click:** a place-tool click with no drag arms a `pending` shape: it
  previews to the cursor and the next click finishes it (`finishPlace`). Esc or a
  tool change cancels; a drag still finishes straight away. Point text still opens
  on its click.
- **Text box height:** `TextGeom.height` (paper mm) comes from the frame's height
  (when ≥ 3 mm). `layoutText` treats it as a minimum, so text grows past it. New
  bottom-right `size` grip (width + height); the right-edge `width` grip stays.
- **Cloud:** ribbon "Cloud" option — Rectangle (two corners / drag) or Freehand
  (click the corners); hook `cloudMode`.

B1 checked in-app by Mark 2026-10-19, with one follow-up: the leader vanished while
the note was typed. Fixed in B2: the note being typed is drawn live
(`withEditing`). Its text block is hidden under the editor but the leader stays
(`renderOne(…, textHidden)` / `TextNote leaderOnly`), and new notes are included.

**B2 built 2026-10-19** (in-app check pending).
- **Engine** `src/lib/annotations/cadSnap.ts` (pure, tested): kinds end / mid / centre /
  intersection / perpendicular / nearest. Point snaps outrank perpendicular, which
  outranks nearest. Intersections are between edges near the cursor; perpendicular
  is from the shape's previous point. Every target is tagged with a source (walls /
  cabinets / fronts / fixtures / benchtops / annotations) and an optional owner
  annotation id, so an item never snaps to itself while edited.
- **Plan targets** `planSnapGeometry.ts`:
  - walls: mitred face outlines (islands: centreline);
  - cabinets: footprint + centre;
  - fronts: resolved `face_zones` rects through `cabinetToPlan` (turned AY zones
    skipped);
  - fixtures: footprint + centre;
  - benchtops: polygon;
  - notes: lines, cloud / box outlines + centres, ellipse ring + quadrants + centre,
    dim line + its points, text block + leader.
  CanvasClient caches room targets and note targets separately (drags rebuild only
  the notes).
- **Hook:** `snap(p, prev, exclude)` works in frame mm (ready for A6 frames). The
  angle lock now only applies when nothing snapped. Drags exclude the item being
  edited. `snapHit` drives `CadSnapMarker` (CAD glyphs, yellow); hovering a drawing
  tool shows what the first click would hit.
- **Ribbon:** a Snap toggle + ▾ menu of kinds and sources (`userPrefs.cadSnap`;
  fixed-position popover so the ribbon scroll can't clip it). Shift = free, as
  before. The canvas's own SnapToolbar settings no longer drive CAD.

**B2b built 2026-10-19** (Mark: "we need to be able to see how long cad lines are… x
and y coordinates on canvas"). In-app check pending.
- `CadMeasureOverlay.tsx` (screen-only, inside the CAD capture group):
  - while drawing: "len mm  angle°" by the cursor (`hook.liveMeasure`: the segment
    being placed, not a dim's offset click), or W × H for a box / ellipse / cloud /
    text box being placed;
  - a single selected line / cloud labels each side (offset along the side's
    normal); an unrotated box / ellipse shows W and H.
- **Ribbon readout:** X / Y of the cursor (frame mm, the snapped point when a snap
  shows; `hook.cursor`), and ΔX / ΔY from the last point while drawing
  (`hook.fromPt`).
- **Ribbon "Size":** Length + Angle for a selected 2-point line (end point moves:
  `withLength` / `withAngle`; angles 0 = right, anticlockwise on screen,
  `segAngle`); W + H for a box / ellipse (`withBoxSize`, first corner fixed). Burst
  undo + debounced save like the style fields.
- Not yet: typing a length *while* drawing (CAD direct distance entry). Candidate
  for B4 alongside the typed offset distance.

**B2c built 2026-10-19** (Mark: "we need a cad side bar when drawing… coordinates,
length, width etc. … on the right hand side when cad f7 is selected"). In-app check
pending.
- `CadPanel.tsx`, docked in the canvas's right panel row (where WallPanel /
  FixturePanel go; CAD mode already clears the canvas selection, so they never show
  together).
- **Sections:**
  - **Cursor:** X / Y, plus ΔX / ΔY / distance / angle from the last point; the snap
    kind.
  - **Drawing:** a point table that follows the cursor; the placing corner + W × H.
  - **Selected:** a typed `Field` commits on Enter / blur (Esc reverts), one undo
    step each via new `hook.patchGeom`.
    - line / cloud: point table (X / Y editable, side lengths), total length /
      perimeter, cloud area, Length + Angle for 2-point lines;
    - box / ellipse: first corner (moves the box), W, H, rotation, centre, area;
    - text: top-left, rotation, text-box W / H (paper mm + plan mm), leader points;
    - dim: both points, offset, type, measured value and shown text.
  - **Multi-select:** extents.
  - **Objects:** every plan note (newest first; colour swatch, kind, summary); click
    to select.
- The ribbon's Size group and X / Y readout moved here (removed from the ribbon).

**B2d built 2026-10-19** (Mark: "when tab is pressed it sends it to the length field so
the user can type in a size"). In-app check pending.
- **Hook state:** `typed` (`TypedEntry`: length / angle / w / h / offset),
  `rawCursorRef` (the unlocked cursor), and `focusReq` for the panel.
  - `typedSeg`: the segment end from the last point; unset parts follow the cursor.
  - `typedBox`: the opposite corner; the cursor picks the direction.
  - A typed dim offset keeps the cursor's side.
  - `typedFields` lists what's offered now; `setTyped` re-locks the preview at once;
    `commitTyped` (Enter) places via `drawClick` / `finishPlace`.
- **Keys** (canvas): Tab or a digit while drawing → focus the first field (a digit
  seeds it). Esc clears typed values first, then cancels. A mouse click while values
  are typed places the locked point. A canvas click blurs a focused panel field
  (pointerdown's preventDefault would otherwise leave it focused).
- **Panel** `TypedEntryFields` in the Drawing section: Tab / Shift+Tab cycle, Enter
  places, Esc clears. Placeholders show the live value; a locked field turns yellow.
- B3's arc / circle tools add a Radius field to `TypedEntry` the same way.

**B2e built 2026-10-19** (Mark: "can you have cad lines snap to each other when close,
mid points etc."). In-app check pending.
- Snapping to other notes was already in B2. The gap was the shape itself: the notes
  set skips it by owner id, so a polyline could not snap back to its own start.
- `ownShapeGeometry(pts, moving, closed, keepSegs)` in `cadSnap.ts` builds targets
  from the shape: every point but the moving one, plus the segments and midpoints.
  While drawing, the point just placed is left out, but its segment back is kept.
  A dragged vertex also drops the two segments that run into it.
- `cadSnap` takes several geometry sets. CanvasClient passes room + notes (+ own),
  with no per-move concatenation. The hook's `toFrame` defaults `own` to the
  drawing in progress; the vertex drag passes its own.

**B3 built 2026-10-19** (in-app check pending). Migration `cad_b3_arc_circle` applied
live (`migration_b3_arc_circle.sql`: kind check widened to add `arc`, `circle`).
- **Geometry:** `ArcGeom { c, r, a0, a1 }` runs from a0 to a1 in degrees, svg
  orientation (increasing = clockwise on screen); `CircleGeom { c, r }`. Helpers:
  `arcFrom3` (circumcentre; the direction is picked so it passes the middle point),
  `arcFromCentre` (anticlockwise on screen, start → end, the CAD default),
  `arcFromEndsRadius` (shorter arc bulging to the cursor side, minimum a half
  circle), plus `arcSvgPath` (flipY flips the sweep flag, ready for A6), sample,
  length.
- **Tools:** Arc (K), with a ribbon "Arc" method: 3-point (start · through · end),
  Centre-start-end, Ends + radius (start · end · bulge side). Circle (O): centre,
  then a point on it.
  - Typed (Tab): circle Radius; centre-mode Sweep (end = start turned anticlockwise
    on screen); ends-mode Radius; earlier clicks use Length / Angle.
  - The helpers live in the hook: `lockPoint`, `typedFieldsFor`, `arcFromDrawing`
    (exported + tested).
- **Render:** an arc path with arrowheads that point along it (Ends group applies);
  circles take Fill.
- **Grips:** arc start / end / middle (re-bend through the three points, `arcFrom3`)
  and a centre dot; circle radius grip. Drag kind `arcGrip`.
- **Snaps:** arc ends + middle + centre and its sampled edge; circle quadrants +
  centre + its ring.
- **Panel:**
  - arc: centre, R, From / To angles shown the drawing way (anticlockwise, 0° right),
    sweep, arc length, chord, and "Flip to the other side" (swaps a0 / a1);
  - circle: centre, R, Ø, circumference, area;
  - live labels: R · sweep · length on the arc, R / Ø on the circle.

B3 fix 2026-10-19 (2c3a891): arc / circle clicks fell through to the text-box path
(missing from the hand-written point-tool list). Clicks now route through `clickRoute`
(named tool sets; an unknown tool does nothing); a test covers every keyboard tool.

**B4 built 2026-10-19** (in-app check pending).
- **Offset tool (F):**
  - Click an item to pick it; a dashed copy follows the cursor on its side; click
    places it. The new copy becomes the source, so clicks repeat outward; Esc picks
    another.
  - Tab → Distance (it keeps the cursor's side and is kept for the next placement).
  - Hit areas stay clickable with the Offset tool (pick); once something is picked,
    any click places.
  - Copies keep the source's style. Geometry: `offsetGeom` / `offsetDistanceFor`.
    Polylines and clouds use mitred corners (`offsetPolyline`); a box or ellipse
    grows / shrinks about its centre; circles and arcs change radius. Not text /
    dims.
- **Side drag:** the midpoint diamonds became **side bars** (`e<N>` grip).
  - Drag = slide that side parallel. `moveEdge` keeps the neighbouring sides on
    their own lines and intersects them with the moved side, so squares stay square.
  - **Ctrl + drag** on the bar still inserts a corner (`m<N>`).
  - Unrotated boxes / ellipses get side bars too (move one edge). Leaders use the
    same bars.

**B4b built 2026-10-19** (Mark: "join line functions, corner radius and fillet
chamfer when clicking on 2 lines … add it in as a right click option too"). In-app
check pending.
- **LineGeom** gains `bulges?: number[]` (per segment, tan(θ/4), + bulges to the
  segment's left normal (-u.y, u.x) in svg coords) and `closed?: boolean`. Fillets are
  arc segments *inside* the line, so it stays one item for offset, snaps, side drag
  and lengths.
- **Geometry:** `bulgeMid / bulgeTangent / bulgeArc / bulgeSegLength / sampleBulged /
  bulgedPath` (flipY flips the bulge side), `filletAt / chamferAt / allCorners /
  reversePoly / joinPolys / cornerJoin / boxToPoly / nearestSegIndex`.
  `offsetPolyline` was rewritten on tangents: sides mitre and tangent arc joins
  just shift, so fillet arcs offset concentric (bulges unchanged).
- **Tools:** Fillet (G, radius on the ribbon, 0 = sharp corner), Chamfer (H, D1 / D2),
  Join (J). Picks come through the items' hit areas (`clickRoute` 'modify').
  - The same line, adjacent sides → that corner.
  - Two lines → `cornerJoin`: each line's end nearer the other pick is trimmed or
    extended to the crossing, they join into one line, then the corner is
    filleted / chamfered. The second line is deleted.
  - A box with Fillet / Chamfer → every corner (it becomes a closed line).
  - Join: the nearest pair of ends (merged if touching, else bridged); the same line
    twice → closed.
  - Problems show as an amber `modMsg` on the ribbon. `replaceShape` can change
    kind (`AnnotationPatch` now allows `kind`).
- **Right-click menu** (`CadContextMenu.tsx`, `edit.onMenu` on the hit areas; also
  opens CAD mode from plain select):
  - fillet / chamfer this corner (nearest interior vertex within 16 px) or all
    corners;
  - join with…, close / open the outline, convert a box to lines, offset…;
  - duplicate, front / back, delete.
- **Bulges everywhere else:**
  - render: a path with arrowheads along the ends; closed lines take Fill;
  - hit areas and bounds use the sampled outline;
  - snaps: corners, straight mids, arc mids + centres, the sampled edge;
  - measure overlay and panel: arc lengths (⌒) and closed area;
  - no side bar on arc segments; midpoint insert splits `bulges`; side drag honours
    closed lines.

**B5 built 2026-10-20** (in-app check pending).
- **Data:** no migration. The newer dims stay kind `dim` with `dt` geometry
  (`SpecialDim`, `isSpecialDim`); linear / aligned keep `DimGeom`.
  - `AngularDim { c, a, b, at }`: `angularSector` picks which of the four angles
    the two lines make from where `at` falls.
  - `RadialDim { dt: radius | diameter, c, r, at }`.
  - `ArcLenDim { c, r, a0, a1, off }`.
  - All are measured when placed and never follow the shape (decision 4).
- **Dimension tool Type** (ribbon): Linear · Aligned · Angular · Radius · Diameter ·
  Arc length · Continue · Baseline (`DimMode`, stored on the drawing as `dimType`).
  - Angular: four clicks (corner, a point on each side, then where the arc sits).
    Snaps make it work on walls / cabinets too.
  - Radius / Diameter / Arc length: pick a circle, an arc or a rounded line corner
    (bulge → `bulgeArc`), then click where the text / dim arc goes
    (`PICK_DIM_MODES`, `arcSourceOf`, `placeRadial`).
  - Continue / Baseline (`chainedDim`): click a linear / aligned dim (or just click —
    it carries on from the last dim drawn, `lastDimId`); each click adds the next.
    Continue = from the previous end, on the same dim line; Baseline = from the
    first dim's start, each one 8 paper mm further out. Esc ends the chain.
  - Changing Type drops a half-done pick / chain (`setDimMode` wrapper).
- **Render** (`SpecialDimShape`): arcs with heads along them (a tick end draws as a
  closed arrow on these), radial extension lines with gap / overshoot, radius /
  diameter leader + tail with horizontal text. Text: `90.0°`, `R300`, `Ø600`,
  `⌒471`; overrides with `<>` still work.
- **Grips:** angular corner + both ray points + `dimAt`; radial `dimAt`; arc length
  `offset`.
- **Panel:** type / measures / shows / centre, plus a note that they don't follow
  the shape.

Next: Mark's real test of the whole plan toolset, then A6 (elevations) (elevations: wall-local frame, canvas +
Elevation Views report, wall-split remap).
