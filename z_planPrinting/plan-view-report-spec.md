# Plan View Report — New Component Spec

## Overview
Build a new `PlanViewReport.tsx` component as a parallel replacement for the existing `shop_drawing_plan` report inside `ReportsModal`. Do not delete or modify the existing code yet — this runs alongside it.

---

## Files to create
- `app/canvas/[roomId]/PlanViewReport.tsx` — the main new component
- `app/canvas/[roomId]/PlanViewReportSVG.tsx` — the SVG drawing component (replaces `PlanDrawingSVG` for this report)

---

## Layer Toggles — persistent via `localStorage`

Key: `plan-view-layers`

Store as JSON object:

```json
{
  "labels": true,
  "dimensions": true,
  "hatch": true,
  "titleBlock": true
}
```

Toggles should appear as a small inline toolbar above the drawing preview inside the report panel. Each toggle is a checkbox-style button. They update localStorage immediately on change.

---

## SVG Layers (in `PlanViewReportSVG.tsx`)

Build each as a gated `{show.x && <LayerX />}` block inside the SVG:

### Walls layer — always on, not toggleable
- Same logic as existing `PlanDrawingSVG` — wall polygons, island lines

### Hatch/fill layer — toggleable (`show.hatch`)
- When on: wall polygons render with `fill="#d8d8d8"`
- When off: walls render with `fill="white"` / outline only

### Cabinet labels layer — toggleable (`show.labels`)
- `cab.label` text centered on each cabinet polygon
- Same font/size logic as existing component

### Dimensions layer — toggleable (`show.dimensions`) — NEW
- For each wall, draw an overall dimension line showing the total wall length
- Dimension line sits outside the wall (offset ~10mm physical), with end ticks
- Text shows value in mm (e.g. `3600`)
- Use same scale-aware sizing pattern: `physical_mm × scale = model_mm`

### Title block layer — toggleable (`show.titleBlock`) — NEW
- Rendered inside the SVG at bottom-left corner of the viewBox
- Contains:
  - Project name
  - Room name
  - Scale (e.g. `1:20`)
  - Paper size (e.g. `A3`)
  - Date (auto, formatted as DD/MM/YYYY)
- Simple bordered box, clean sans-serif, scale-aware font size

---

## PDF Export — true scale

This is the key fix over the existing system.

### How it works

```
printable area (mm) = paper size minus margins (e.g. A3L = 380 × 257 usable)
SVG width in px = printable_area_w_mm / scale × 3.7795 (mm to px at 96dpi)
SVG height in px = printable_area_h_mm / scale × 3.7795
```

Set the SVG `width` and `height` attributes to these pixel values before rendering to PDF. The `viewBox` stays in model mm — do not change it. This causes the drawing to render at true 1:N scale on the page.

Use `jsPDF` + `svg2pdf.js` for the PDF export (already used elsewhere in the project via `generateElevationPDF`). Follow the same pattern as that file.

Output filename: `plan-{roomName}-1-{scale}.pdf`

---

## Props for `PlanViewReportSVG`

```tsx
{
  walls: Wall[]
  cabinets: CabinetInstance[]
  svgRef: RefObject<SVGSVGElement | null>
  scale: number
  show: {
    labels: boolean
    dimensions: boolean
    hatch: boolean
    titleBlock: boolean
  }
  projectName: string
  roomName: string
  paperKey: string   // e.g. 'A3L'
}
```

---

## Paper sizes — same as existing

```ts
const PAPER = {
  A4L: { w: 297, h: 210, label: 'A4 Landscape' },
  A3L: { w: 420, h: 297, label: 'A3 Landscape' },
  A2L: { w: 594, h: 420, label: 'A2 Landscape' },
  A1L: { w: 841, h: 594, label: 'A1 Landscape' },
}
```

Margins: 20mm all sides for usable area calculation.

---

## Wiring into `ReportsModal`

In `reports_modal.tsx`, add `PlanViewReport` as an option in the `REPORTS` array alongside the existing `shop_drawing_plan`:

```ts
{ id: 'plan_view_v2', label: 'Plan View (New)', desc: 'Scaled PDF with toggleable layers' }
```

Pass through: `project`, `room`, `walls`, `cabinets`, `scale`, `printPaper`

---

## Scale selector — same as existing

```ts
const SCALES = [5, 10, 15, 20, 25, 50, 100]
```

Default: `20`

---

## Notes for Claude Code
- Reuse geometry helpers from `@/src/lib/geometry` — `wallEnd`, `wallInwardNormal`, `wallMitrePolygon`, `cabinetPolygon`, `cabinetCenterPt`, `centroid`, `cabWallPerp` are all available
- Follow the scale-aware sizing pattern already in `PlanDrawingSVG`: `physical_mm × scale = model_mm`
- The `viewBox` is in model mm — do not change this for PDF export, only change `width`/`height`
- Check `generateElevationPDF.ts` for the jsPDF/svg2pdf pattern to follow for PDF generation
- Don't touch any existing files except adding the new report entry to `REPORTS` array and rendering `<PlanViewReport />` in the content switch block
