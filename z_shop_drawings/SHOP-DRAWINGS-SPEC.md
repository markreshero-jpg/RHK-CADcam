# Shop Drawings Package — Spec

Status: **S1 + S2 checked by Mark 2026-10-21. S3 built 2026-10-21** (in-app check pending), with
benchtops added to the plan drawing. S9 tutorial written for the S3 flow. Next: S4.

Reference: `z_sample_planscabinet_vision/RHK6456 - Suzie and Jeff Morris - Kitchen Shop Drawings.pdf`
(the Cabinet Vision set we're replacing: plan, wall elevations, island elevations, 3D, doors-off interior).

Menu entry: **Production → Shop Drawings…** (`canvasMenuConfig.ts`, currently `disabled: true`).

## Locked decisions (Mark, 2026-10-21)

1. **One PDF per room.** The package holds every sheet for that room.
2. **Company title block on every sheet**, matching the CV layout. Company details are filled out in
   **Settings** (see S1). Per-job fields come from the job.
3. **Spec notes block = CAD.** The benchtop / colours / hardware notes are written on the plan
   canvas with the CAD tools (text box), not generated. **All CAD annotations transfer to the PDF**,
   on plan and elevations.
4. **Keep cabinet numbering** (#1, #2… as on the CV elevations): the same number for a cabinet on
   every sheet.
5. **Both island faces on one page if they fit** at the package scale. Otherwise one face per page.
6. **One scale for every drawing on every page.** Default **1:20 on A3**. If a view doesn't fit at
   that scale, warn and name the view. Never quietly rescale one sheet.
7. **Interior elevations (doors off) are optional.** Ticked per wall in the package dialog, off by default.
8. **Lines must be as crisp as possible in the PDF** (see "PDF quality rules").

## Title block (CV layout)

| Area | Content | Source |
|---|---|---|
| Left | Logo, company name, address, phone, fax, website | Settings → Company (new) |
| Middle | Job no. + client name / drawing type ("Joinery") / site address | job (`client_name`, `client_address`, job number) |
| Right | Scale / "Do not scale off this drawing." / Sheet n of N / Drawn By / Date | package |
| Above | "Client Approved Signature : …… Date : ……" line | fixed text, toggle in Settings |
| Below | Copyright line ("All drawings are copyright & are owned & controlled by …") | Settings → Company |

The view title + scale at top-left of each sheet ("Kitchen Plan 1 : 20", "Kitchen Elev 1 1 : 20").

## Sheet order

1. Plan
2. Wall elevations, in wall order (walls with nothing on them are skipped)
3. Island / peninsula: both faces on one sheet if they fit
4. Interior elevations (only walls ticked in the dialog)
5. 3D views (S8)

## PDF quality rules

- **Vector only.** Everything goes through svg2pdf. No canvas / PNG snapshots of drawings. A 3D
  sheet must be a vector hidden-line view, not a WebGL screenshot.
- **Pen table in paper mm**, shared by every sheet, e.g. walls 0.5 / carcase 0.35 / fronts 0.25 /
  dims and hatch 0.18. Minimum 0.13mm, so nothing becomes a hairline that some viewers draw at
  1px. Width doesn't change with scale.
- Text stays real PDF text (Helvetica), not outlines. Same font metrics on screen and in the PDF.
- Solid black ink. No opacity, filters or blur. Light greys only where the CV set uses them (hatch).
- Joins/caps: miter joins on wall and carcase outlines; butt caps on dimension ticks.
- No double-drawn overlapping lines (they print heavier, and touching edges make strokes look fuzzy).
- Check: open the exported PDF at 400–800% zoom in Acrobat and Chrome, and print one A3 sheet.

## Phases

| Phase | Scope | Status |
|---|---|---|
| S1 | **Company settings + shared title block.** Settings → Company: logo upload, name, address, phone, fax, website, copyright text, signature-line toggle. One `ShopTitleBlock` SVG component in the CV layout, used by Plan View, Elevation Views and the package. New table needs RLS policies (admin/tester). | [x] built 2026-10-21; in-app check pending |

### S1 notes (as built)

- **No new table.** Company fields already lived on `shop_settings`; S1 added `company_fax`,
  `company_logo_url`, `drawing_copyright`, `drawing_disclaimer` (default "Do not scale off this
  drawing."), `drawing_signature_line` (default true). Logo goes in a new public-read / admin-write
  bucket `company-assets`. It has its own policies, so the shared `models_admin_*` ones are untouched.
  Migration: `migration_s1_company_title_block.sql` (applied).
- `src/lib/shopDrawings/companyTitle.ts` → `useCompanyTitle()` loads it once per session and
  turns the logo into a data URL (svg2pdf can't fetch remote images). Settings → Company calls
  `invalidateCompanyTitle()` after a save.
- `app/canvas/[roomId]/ShopTitleBlock.tsx` is a standalone SVG in **paper mm**: 24mm box, a 6mm signature line
  above, a 4.5mm copyright line below. Columns: company 30% / job 36% / scale 17% / sheet 17%.
  `sheetTitle()` fills job no. + client, room name, site address (`client_address`), scale,
  sheet n of N and date. **Drawn By is blank** (no user display name yet). `pageLayout()` puts it at
  the foot of the page and gives back the drawing area above it.
- Plan View and Elevation Views no longer draw a title block inside the scaled drawing. The export
  draws `ShopTitleBlock` at the page foot as a second svg2pdf pass, and the fit check uses the
  smaller area. Elevations number Sheet n of N across the selected walls.
- Logo upload takes PNG / JPEG only. Checked headless: the PNG embeds and all text stays real PDF text.
| S2 | **Pen table + crispness pass** on PlanViewReportSVG / ElevationPrintSVG: shared paper-mm pen table, remove opacity/raster, check overlapping strokes; zoom + print check | [x] built 2026-10-21; Mark's zoom + A3 print check pending |

### S2 notes (as built)

- `src/lib/shopDrawings/pens.ts`: `PEN` = ground 0.5 / heavy 0.35 / medium 0.25 / front 0.18 /
  thin 0.13 / fine 0.09 (paper mm; thinned one step 2026-10-26, Mark: "line weights look very heavy" —
  was 0.7 / 0.5 / 0.35 / 0.25 / 0.18 / 0.13), `PRINT_INK` = #000, `pen(name, P)`, `atLeastMin()`.
- PlanViewReportSVG: walls heavy; carcase outline medium; case parts / kicks / bins / drawer boxes /
  runners / internals / swings / drawer lines / dims thin; drawer fronts front; hatch fine.
  The greys (#222 / #333 / #777) are now black; vertical case parts keep a grey *fill*. The 0.75-opacity
  row-name text is now solid.
- ElevationPrintSVG: carcase / openings medium; fronts / kicks front; internals / dims / handles /
  hinges / chevrons thin; floor line ground. #111 / #555 / #999 are all black.
- Both: every layer-weighted line goes through `lw()` = `atLeastMin(layers.w(...))`, so a layer
  set can thicken lines but never take them below 0.13mm. Layer-set opacity / ghost stays (the user's
  choice). `opacity="1"` writes nothing into the PDF (checked), so those attributes stay.
- **Fonts:** svg2pdf only knows normal / bold. The elevation's `fontWeight="600"` cabinet labels were
  printing in **Times**; now bold. The root `<svg>` of both drawings sets Arial/Helvetica, so every
  text inherits it. Checked: the exported PDF uses only Helvetica + Helvetica-Bold.
- Overlapping strokes: coincident black lines at the same width print the same as one line, so no
  dedupe was done.
- Test `src/lib/__tests__/shopDrawingPens.test.ts`: renders both SVGs at 1:20 and 1:50 and
  asserts every stroke is #000 and ≥ 0.13mm, and that there are no numeric font weights. It fails on the
  pre-S2 code.
| S3 | **Package export.** Shop Drawings dialog (scale default 1:20, paper default A3L, sheet list with ticks, interior-elevation ticks, fit warnings); one multi-page jsPDF; Sheet n of N; filename `shop-drawings-{job}-{room}.pdf`; enable the menu item | [x] built 2026-10-21; in-app check pending |

### S3 notes (as built)

- `ShopDrawingsReport.tsx` is a new **Shop Drawings** entry at the top of the Reports window. It reuses the
  modal's data, scale (default 1:20) and paper (default A3). **Production → Shop Drawings…** opens the
  room's reports straight on it (`openShopDrawings` → `initialReport`).
- Sheets = Plan, then each standard wall by `sort_order`. Default ticks: the plan plus walls with
  cabinets. Ticks are remembered per room (localStorage `shop-drawings-sheets`). Island walls come in S4;
  interior-elevation ticks come in S7.
- Page layout (`pageLayout(paper, 10, tbH, HEADING_H)`): 10mm margin; `SheetHeading` ("Kitchen Plan
  1 : 20", "Kitchen Elevation W1 1 : 20") top-left; drawing at true scale, centred in the band between
  heading and title block; `ShopTitleBlock` at the foot with Sheet n of N over the ticked sheets.
- The previews are true page layouts (percent-positioned on a paper-aspect box), so what you see is the PDF.
  A sheet that doesn't fit gets an amber outline and is named in the warning with its size. It is never
  rescaled (decision 6).
- Layer sets: one picker for the plan and one for elevations. They share Plan View / Elevation Views'
  stored choice, as do their page extras (hatch, wall names, return walls, annotation colours). The title
  block is always on.
- **Benchtops on the plan (Mark, 2026-10-21):** PlanViewReportSVG now draws `benchtops` (Plan View and
  the package). Outline in the front pen with sink / hob cutouts as holes, no fill, over the cabinets;
  `bt.joins` dashed thin. They follow the `benchtops` / `benchtop_joins` layer items and are included in
  the drawing's fit. Edge-profile codes aren't printed.
- Tutorial `shop_drawings` (reports topic), emit `shop_pdf`, tour target `shop-download`.
- **Plan fitted to what's drawn (Mark, 2026-10-25: "lots of room at top and left"):** PlanViewReportSVG used
  to pad every side by a worst-case border (wall thickness + deepest island / back-side cabinet + every
  dim row), even sides with no chains. The viewBox is now the extents of walls, cabinets, fixtures (door
  swings), benchtops, annotations and each dim row / depth dim as drawn (labels both sides, row names),
  plus 4mm paper. RHK6581 J05+J04 at 1:20: 587 x 337 → 479 x 233mm (still over A3's ~400mm; needs 1:25
  or a per-sheet scale, which decision 6 doesn't allow yet).
- **Spec blocks to their own sheet (Mark, 2026-10-25):** when the plan doesn't fit *with* its spec
  blocks, they come off the plan (which re-fits without them) and print on a **Specifications** sheet
  placed *first*, before the plan. They're laid side by side at their paper size, tops aligned, wrapping
  at the page width, and marked NTS. The sheet follows the plan's tick. A spec block is a note inserted
  from a CAD block whose name contains "spec": `style.block` = the block's name, set on insert
  (`tagBlockItems`). The 16 blocks already placed (SPECIFICATIONS / APPLIANCES + SINKS headings) were
  tagged once in the DB. The decision uses the plan's size *with* the blocks (`data-full-w/h`), so it
  can't flip back and forth. RHK6581 J05+J04 at 1:20: 479 → 392 x 233mm (fits A3 width; height fits
  only without the signature / copyright lines). Test `specSheet.test.ts`.
- **Islands + back sides (Mark, 2026-10-26: "shop drawings don't include island bench walls"):** the
  package and Elevation Views only printed standard walls' face side. Now `elevationViews()`
  (src/lib/shopDrawings/elevationViews.ts): every standard wall's face in wall order, plus its back when
  cabinets stand on it, then islands (face + back, whichever have cabinets). ElevationPrintSVG takes
  `side`; the back runs right-to-left (x = length − t − dx) like the canvas, titled "<wall> — back".
  Keys: face = wall id (old ticks still match), back = `<id>:back`. No ceiling / soffit lines on islands.
- **Spec sheet fills the page (Mark, 2026-10-26: "hard to read, lots of blank space"):** being NTS, the
  Specifications sheet is enlarged to fit the drawing band, up to 2.5× (`SPEC_MAX_ZOOM`). The blocks
  wrap at whichever row width gives the biggest enlargement (narrower rows stack them to use the height).
  Borders (2026-10-26, "lost its border"): the sheet was sized from the bare text, so each box's 2mm
  padding + border pen fell outside the viewBox and clipped. Now laid out and fitted by `drawnBounds()`
  (blocks.ts: bold / line spacing, bgPad, half the border pen) with a 2mm white margin (`SPEC_MARGIN`).
- **Fixtures on plan + elevation (Mark, 2026-10-21):** `FixturesPlanPrint` (FixturesPlan.tsx) and
  `FixturesElevationPrint` (FixturesElevation.tsx) draw the non-opening fixtures (appliances, sinks, taps,
  hobs, decorative) on Plan View, Elevation Views and the package, using the canvas's shapes / symbols /
  traced shapes and labels. Black, front pen; plan front edge medium; labels 2.5mm. Symbol lines stay
  ≥ 0.13mm. Plan: over the benchtops. Elevation: over the cabinets (white fill, so it hides what's
  behind; appliances keep their inner panel). Follow the `fixture_*` / `fixture_labels` layer items.
  Doors / windows were already drawn.
  (Plan cabinet names moved to the front edge, sizes dropped, so the "Sink" label no longer clashes.)
- **Fixture display names (Mark, 2026-10-21):** drawings show a short name, not the full product name.
  The full detail lives in the spec block / schedules. New column `room_fixtures.display_name`
  (migration_fixture_display_name.sql, applied) is set in the fixture sidebar under Label. Blank →
  `fixtureDisplayName()` generic from the kind: Sink, Basin, Tap, Cooktop, Oven, Microwave, D/W,
  Rangehood, Fridge; else the kind; else the category; else the name. Used by the canvas plan /
  elevation labels and every print sheet. Schedules / lists still use label || name.
- **Benchtops on elevations (Mark, 2026-10-21):** BenchtopElevation has a `print` mode (black, white fill,
  pen widths, no labels / picking / profile codes). Elevation Views and the package draw it over the
  cabinets and under the fixtures. Inputs come from the canvas (`bt3d` → btInfo / btProfiles).
- **3D layer set (Mark, 2026-10-21: "drawer fronts missing / see-through, no benchtops"):** the 3D sheet
  was using the Elevations set's 3D settings, and several saved sets hide fronts / tops in 3D (Schematic,
  Kicks, No tops) or ghost the carcase (Face elevation). The 3D views now have their own picker
  (`shop-3d-layer-set`), defaulting to the canvas's active set. Changing it re-captures.
| S4 | **Multi-view sheets:** lay out several views on one page at one scale (island front + back); fall back to one per page | [ ] |
| S5 | **CAD carry-over check.** Plan CAD already prints (Plan View). Elevation CAD needs z_CAD_tool **A6** first. Confirm text boxes with borders (the spec block) print right | [ ] (blocked on A6 for elevations) |
| S6 | **Cabinet numbering:** #n tags under each cabinet on elevations, same as on the plan, from `cab.label` as it is (no renumbering) | [ ] |
| S7 | **Interior elevation (doors off):** drawing mode with fronts hidden, shelves shown and labelled (ADJ SH / FIX SH) and dimensioned | [ ] |
| S8 | **3D sheet**: perspective vector hidden-line room views, auto + saved shots, blockers removed, 3–4 / 1–2 per sheet by room size, NTS (see "S8 — 3D room views") | [ ] |
| S9 | Tutorial (Production → Shop Drawings) | [x] written with S3; extend as S4–S8 land |

## S8 — 3D room views (locked, Mark 2026-10-21)

1. **Perspective** views, like CV / a photo.
2. **Auto + adjustable shots:** 3–4 angles picked from the room layout (one looking at each main run,
   the island from each side). Each can be unticked, and Mark can save his own angle from the 3D view as
   an extra shot.
3. **Blockers are removed** from that shot. A wall between the camera and what it's looking at is hidden
   (dollhouse cut-away). So is an island / tall unit / other object that blocks the subject.
4. **Layout by room size:** a small room (longest side < 2000mm, e.g. a vanity) puts **3–4 shots on a
   sheet**. Bigger rooms put **1–2 per sheet**.
5. 3D sheets are the one exception to "one scale": they're marked **NTS**.

How it's built (plan):
- **Vector hidden-line output:** render the existing 3D scene off-screen per shot, then use its depth
  buffer to keep only the visible pieces of each edge. Only those go to svg2pdf as lines, so nothing is
  raster. (CabinetSheetSVG's painter-sorted iso is too simple for a whole room.)
- Appliance / fixture GLB models print as **simplified outlines** (bounding shapes + main edges).
  Otherwise their thousands of tiny edges print as a smudge.
- Same pen table (S2): outlines medium, fronts / handles thin, all black.

### S8 stage 1 (built 2026-10-21, in-app check pending)

- `src/lib/shopDrawings/hiddenLine.ts` → `captureHiddenLines(gl, scene, camera)`:
  - A float render target (2400×1800) holds eye depth from a tiny ShaderMaterial override, with
    near / far tightened to the scene.
  - Crease edges come from `EdgesGeometry` (25°), sampled every ~1.5px. An edge is visible where any of
    the 3×3 pixels is at or behind it (tolerance 0.4% + 2mm).
  - **Feature edges, not mesh edges (Mark, 2026-10-21: "fixtures aren't showing true shape"):**
    vertices are welded by position, then an edge is drawn if it's a boundary, a crease (> 25°; > 50°
    for meshes over 1500 triangles), or a silhouette (its two faces point opposite ways from the eye).
    Curved appliances / taps / handles print as their true outline plus main creases. On detailed
    meshes, crease pieces under 2px are dropped. (This replaced the bounding-box stand-in.)
  - **Drawer fronts showing through (fixed):** the visibility tolerance was 0.4% of depth (~25mm at 6m),
    so drawer boxes and carcase edges 20mm behind an 18mm front leaked through. Now 1mm + 0.04%.
    Runs bridge up to 2 hidden samples (grazing flicker). Partial runs under 2px are dropped; whole
    short edges (silhouette chains) are kept.
  - Mesh-based line objects (drei <Edges> / Line2 fat lines) are excluded from depth and edges.
  - Ghosted (opacity < 0.5) meshes, lines, text and sprites are ignored.
  - Checked headless (SwiftShader) on a test room: the island hides the run behind it, back edges are
    gone, a 3k-triangle "appliance" prints as a box; ~180ms.
- `shots3d.ts` → `autoShots()`. Stage 1 = one raised 3/4 shot (swung 28°) of the wall with the most
  cabinet run; eye far enough back to fit the run. `wallsBehindEye()` hides every perimeter wall whose
  room side the eye isn't on. RoomScene's hiddenWallIds also drops that wall's cabinets and tops.
- `RoomScene` is exported with `printMode` (no orbit controls, floor, wall labels).
  `Room3DCapture.tsx` mounts it off-screen (1200×900 canvas). For each shot it sets the hidden walls,
  waits 1.5s to settle (part details, GLBs), points the camera, and captures. `Shot3DSVG` draws the
  segments as one black path, padded and fitted to the sheet band, at the front pen.
- Package: a **3D views** sheet (heading "Room 3D NTS", title block "Scale: NTS"), ticked by default.
  Captured once per open; **Re-render 3D** recaptures. Download waits for the capture. Uses the elevation
  layer set's 3D view.
- **Hidden lines vs thin skins (Mark, 2026-10-26: curved cabinets showed formers through the face):**
  the curved face board is pocketed to a 2mm skin, inside the old 3–4mm visibility tolerance. The depth
  pass now also writes a mesh id: an edge keeps the generous tolerance only against its own faces, and
  needs to be within ~1mm of any other part (`tolOther`), so parts behind a thin skin stay hidden.

### S8 stage 2 (built 2026-10-21, in-app check pending)

- **Auto views** (`autoShots`): one per cabinet run (face-side run ≥ 400mm, longest first, max 4, swings
  alternate ±28°), plus each island from both sides (`I1 front` / `I1 back`). With no runs, one view of
  the longest wall.
- **Blockers:** any cabinet with a corner inside the eye → subject triangle **and** ≥ 700mm in front of the
  subject line. This catches islands / peninsulas / free-standing units out on the floor, but not the
  corner units beside a run. An island blocker hides its whole island wall (its top goes too); any other
  hides just that cabinet (`hiddenCabinetIds`, new RoomScene prop).
- **Saved views:** in the 3D view, right-click empty space → **Save view for shop drawings**. It stores the
  camera + the walls hidden right now in `rooms.shop_3d_shots` (jsonb, migration_s8_saved_3d_shots.sql,
  applied). The live view now records its camera from the start, so saving works before any orbit. The
  package lists the saved views with a ✕ to remove them.
- **Per-view ticks:** a "3D views" row under the sheet ticks, remembered per room
  (`shop-drawings-3d-off`).
- **Layout** (`shotsPerSheet`): a room whose longest side is < 2000mm puts 4 per sheet (2 × 2); else 2 per
  sheet (side by side); a lone last view gets the whole band. As many 3D sheets as needed, all NTS. The
  PDF places each view from its cell's paper-mm box.
- Capture runs through the pending views one at a time (1.5s settle each).
- Tutorial `shop_3d_view` (emit `shop_view_saved`).
- **Elevation drilling off (Mark, 2026-10-21):** hinge cup / plate bores and drawer-front fixing bores never
  print on the elevations (`PRINT_DRILLING = false` in ElevationPrintSVG), whatever the layer set.

### Labels on the package (Mark, 2026-10-21)
- No cabinet names on the plan sheet, no cabinet sizes on the elevation sheets, whatever the layer set
  (`without()` in ShopDrawingsReport). The standalone Plan View / Elevation Views reports still follow the set.

### Movable labels (Mark, 2026-10-21)
- Cabinet + fixture names move on the canvas plan and elevation via right-click → **Move label**: the name
  gets a dashed box, follows the mouse, a click places it, Esc / right-click cancels (`useLabelMove` +
  `LabelBox`; window capture listeners swallow the clicks). Replaced drag-when-selected (Mark, 2026-10-21). Saved per item in `label_offsets` {plan, elev} (migration_label_offsets.sql,
  applied): plan = offset from the centre in the item's own frame, elev = offset from the elevation box centre.
  Right-click → Reset label position clears the current view. Plan View / Elevation Views / shop drawings print
  at the same spot. Tutorial `move_label`.

### Job Reports — any room (fix, 2026-10-21)
- The drawing reports (shop drawings, plan, elevations, cabinet sheets) used to draw only the open room in
  Job Reports, with no benchtops (so no tops in the 3D views either). Job Reports now shows a **Room:** picker;
  each room still makes its own PDF (locked: one PDF per room). The open room draws from the live canvas;
  other rooms from the job load, with their own walls / cabinets / fixtures / tops, CAD (`{fields}` filled
  for that room) and benchtop thickness (`useBenchtopCatalog.forRoom` + that room's base height).
- **Several rooms at once (Mark, 2026-10-21):** the Rooms row ticks rooms (All / None; click a name to preview).
  **Download N rooms** queues them: each room's report remounts with `batch`, downloads its own PDF once ready
  (useBatchDownload: drawings measured, 3D rendered, data loaded; 90s give-up), then hands on. Still one PDF
  per room. Works for shop drawings, plan, elevations and cabinet sheets.

## Answered (Mark, 2026-10-21)

- 3D sheet: **keep it** (S8).
- Cabinet numbers: **use `cab.label` as it is.** No renumbering in the package. Mark may change
  labelling at canvas level later.

## 3D colour render report (trial, Mark 2026-10-24)

A separate report, **3D Colour Render**, so the vector-only rule above still holds for the shop drawings.
`Render3DReport.tsx`: the same views as the 3D sheet (auto + saved, blockers hidden, own ticks
`render-3d-off` + layer set `render-3d-layer-set`), rendered off-screen by `Room3DRender`
(Room3DCapture.tsx: RoomScene printMode + floor, antialiased, the canvas's material colours) to a
2400px-wide JPEG shaped to the page band, one view per page, heading "<room> 3D · <view>" + title block, NTS.
Checked headless (`z_plan_automation/verify-render3d.mjs`, RHK6581 Laundry J02). Next: Mark tweaks the look
(lighting / shadows / edges / background), then decide whether its pages join the shop drawings / other reports.

## Cabinet sheets: true part shapes (Mark 2026-10-24)

Decisions: keep the sheet's look (grey fronts, dashed internals, dims) and draw real outlines; a **PLAN** view
is always on the sheet (bottom row: PLAN | 3D). `src/lib/partSolids.ts` builds each part as the cabinet 3D view
does (same box helpers, `partShapes()` — now shared with Cabinet3DView — size + rotation overrides, AY turns) as a
prism in cabinet coords. FRONT / SIDE: a shaped or turned part draws `prismOutline()` (true outline + holes when
seen face-on, else its silhouette) instead of its rect; a shaped back shows dashed in FRONT. PLAN: every part's
outline from above. 3D: shaped / turned parts as shaded prisms (cap + visible sides, silhouette / crease lines).
Checked headless on the test room's BC-04 (rib cut-out gable) + BC-08 (shaped door + back):
`z_plan_automation/verify-sheet-shapes.mjs`. Not drawn yet: standalone custom parts (never were on the sheet).
**Cabinet edit modal (2026-10-25):** the Top / Elevation / Side tabs now draw the same true shapes —
`buildPartSolids()` (partSolids.ts) is shared by the sheet and `ResolvedViews`; a shaped / turned part passes
`pathD` to `PartShape` (wins over the rect / rotation silhouette, holes evenodd) and skips its rect edge tape.
Checked headless on BC-04 + BC-08: `z_plan_automation/verify-modal-shapes.mjs`.
