# Shop Drawings Package — Spec

Status: **S1 checked by Mark 2026-10-21. S2 built 2026-10-21** (print check pending). Next: S3.

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

- `src/lib/shopDrawings/pens.ts`: `PEN` = ground 0.7 / heavy 0.5 / medium 0.35 / front 0.25 /
  thin 0.18 / fine 0.13 (paper mm), `PRINT_INK` = #000, `pen(name, P)`, `atLeastMin()`.
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
| S3 | **Package export.** Shop Drawings dialog (scale default 1:20, paper default A3L, sheet list with ticks, interior-elevation ticks, fit warnings); one multi-page jsPDF; Sheet n of N; filename `shop-drawings-{job}-{room}.pdf`; enable the menu item | [ ] |
| S4 | **Multi-view sheets:** lay out several views on one page at one scale (island front + back); fall back to one per page | [ ] |
| S5 | **CAD carry-over check.** Plan CAD already prints (Plan View). Elevation CAD needs z_CAD_tool **A6** first. Confirm text boxes with borders (the spec block) print right | [ ] (blocked on A6 for elevations) |
| S6 | **Cabinet numbering:** #n tags under each cabinet on elevations, same as on the plan, from `cab.label` as it is (no renumbering) | [ ] |
| S7 | **Interior elevation (doors off):** drawing mode with fronts hidden, shelves shown and labelled (ADJ SH / FIX SH) and dimensioned | [ ] |
| S8 | **3D sheet** (kept): vector hidden-line room views from saved camera angles | [ ] |
| S9 | Tutorial (Production → Shop Drawings) | [ ] |

## Answered (Mark, 2026-10-21)

- 3D sheet: **keep it** (S8).
- Cabinet numbers: **use `cab.label` as it is.** No renumbering in the package. Mark may change
  labelling at canvas level later.
