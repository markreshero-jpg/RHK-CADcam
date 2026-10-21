# Shop Drawings Package — Spec

Status: **spec written 2026-10-21, nothing built.** Next: S1.

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
5. (open, see S7) 3D views

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
| S1 | **Company settings + shared title block.** Settings → Company: logo upload, name, address, phone, fax, website, copyright text, signature-line toggle. One `ShopTitleBlock` SVG component in the CV layout, used by Plan View, Elevation Views and the package. New table needs RLS policies (admin/tester). | [ ] |
| S2 | **Pen table + crispness pass** on PlanViewReportSVG / ElevationPrintSVG: shared paper-mm pen table, remove opacity/raster, check overlapping strokes; zoom + print check | [ ] |
| S3 | **Package export.** Shop Drawings dialog (scale default 1:20, paper default A3L, sheet list with ticks, interior-elevation ticks, fit warnings); one multi-page jsPDF; Sheet n of N; filename `shop-drawings-{job}-{room}.pdf`; enable the menu item | [ ] |
| S4 | **Multi-view sheets:** lay out several views on one page at one scale (island front + back); fall back to one per page | [ ] |
| S5 | **CAD carry-over check.** Plan CAD already prints (Plan View). Elevation CAD needs z_CAD_tool **A6** first. Confirm text boxes with borders (the spec block) print right | [ ] (blocked on A6 for elevations) |
| S6 | **Cabinet numbering:** #n tags under each cabinet on elevations, same as on the plan, from `cab.label` | [ ] |
| S7 | **Interior elevation (doors off):** drawing mode with fronts hidden, shelves shown and labelled (ADJ SH / FIX SH) and dimensioned | [ ] |
| S8 | (open, Mark to decide) **3D sheet:** vector hidden-line room views from saved camera angles | [ ] |
| S9 | Tutorial (Production → Shop Drawings) | [ ] |

## Open questions

- S8: is the 3D sheet wanted? It's the hardest part to keep vector.
- S6: are `cab.label` values already numbered the way you want (#1…#n), or should the package number
  cabinets itself in wall order?
