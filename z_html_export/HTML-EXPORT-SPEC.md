# 3D HTML export

Status: **H1 built 2026-11-12, check pending.** H2–H5 not started.

A room (later a whole job) saved as one `.html` file anyone can open in a
browser: the room's 3D model embedded as a GLB (base64), three.js viewer.
For sending to clients, builders and the workshop.

## Locked decisions

1. **One self-contained file.** The GLB is embedded, so there are no side files.
   three.js loads from jsDelivr, so the file needs internet when opened (H5 inlines it).
2. **Static snapshot (H1).** What the app's 3D view shows (layer set, colours,
   hidden walls) is what gets exported (`GLTFExporter`, `onlyVisible`). Doors and
   drawer fronts can be hidden, not opened.
3. **Exported solid, nothing selected.** If the app is in Wire view it is switched
   to solid for the export and back again afterwards. The file has its own Wire button.
4. **Doors = face zones.** The Doors toggle hides every node whose `userData.partId`
   starts with `zone_` (doors + drawer fronts). The button is dropped when a room has none.
5. **Views.** The file opens at the app's camera when exported. Reset view = the
   whole room from the front, a little above.
6. **File name** `<job> - <room> - 3D.html`, downloaded by the browser.
7. **Canonical viewer** is `src/lib/export3d/roomHtml.ts`.
   `z_plan_automation/share3d/template.html` is the older copy used by the headless script.

## Phases

| Phase | What | Status |
|---|---|---|
| H1 | Room 3D view toolbar **⬇ Export 3D** (desktop): Wire, Doors (hide), Reset view | Built 2026-11-12, check pending |
| H2 | Doors swing open, drawers slide out (hinge / slide data in GLB extras) | — |
| H3 | Hide by group (overheads, benchtops, kicks, walls) via display layers; click a cabinet for its code + size | — |
| H4 | Export all rooms in a job, one file with a room picker (compressed GLBs) | — |
| H5 | Fully offline (three.js inlined) | — |

## Files

- `src/lib/export3d/roomHtml.ts`: scene holder, GLB export, viewer template, download.
- `app/canvas/[roomId]/Room3DScene.tsx`: `SceneExportBridge` hands the live scene to
  `room3dScene` (dev also gets `window.__room3d.exportGLB()`).
- `app/canvas/[roomId]/CanvasClient.tsx`: `exportRoom3DHtml()` + toolbar button
  (`data-tour="export-3d-html"`, tutorial event `export_3d_html`).
- Test: `z_plan_automation/_tmp-export3d-btn.mjs <roomId> <outDir>` clicks the
  button headlessly, opens the file, screenshots solid / reset / no doors / wire.
