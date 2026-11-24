# 3D HTML export

Status: **H1 built 2026-11-12, H5 + H6 built 2026-11-18, moved to Room › Export 3D… + phones 2026-11-24, checks pending.** H2–H4 not started.

A room (later a whole job) saved as one `.html` file anyone can open in a
browser: the room's 3D model embedded as a GLB (base64), three.js viewer.
For sending to clients, builders and the workshop.

## Locked decisions

1. **One self-contained file.** The GLB is embedded, so there are no side files.
   Since H5 the viewer (three.js bundled, one classic script, no import map / modules)
   is inlined too, so the file opens offline in any browser with WebGL.
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
7. **Canonical viewer** is `src/lib/export3d/viewer/main.ts`, bundled by
   `npm run build:viewer` into `public/share3d/viewer.js` (committed). The page
   around it is `viewerPageHtml()` in `src/lib/export3d/roomHtml.ts`. Rebuild the
   bundle after changing the viewer or upgrading three.
   `z_plan_automation/share3d/template.html` is the older copy used by the headless script.
8. **Macs (2026-11-18).** Mail / Finder previews (Quick Look) never run scripts, so an
   HTML file there stays on "Loading". The file's loading text says to save it and
   open it in Safari / Chrome. For clients use the share link; Apple users can also
   get a USDZ.
9. **Export 3D is Menu › Room › Export 3D…** (2026-11-24, Mark: moved off the 3D toolbar so
   phones get it too; on a phone it is Menu ▾, under Room). It opens a dialog: Share link
   (default for clients), HTML file, Apple USDZ file. From plan / elevation / section the 3D
   view opens first and the export is taken from it (the view stays on 3D).
   A share link is shown in the dialog with **Copy link** and, where the browser has it,
   **Share…** (the phone share sheet): after the upload the tap is too old for iOS to allow
   a clipboard write, so the copy needs its own tap.
10. **USDZ** is made from the GLB (re-loaded so every material is MeshStandardMaterial),
    scaled mm → metres so AR is life size, sat on the floor at the origin,
    `quickLookCompatible`. No Wire / Doors. Double-sided materials export single-sided
    (three warns), so a wall may vanish when seen from behind.
11. **Share links** upload `model.glb`, `model.usdz`, `meta.json` to the public bucket
    `share-3d` at `<roomId>/<token>/` (token = random UUID, no select policy so the bucket
    can't be listed). `/share/3d/<roomId>/<token>` (route handler, no login: `proxy.ts`
    skips `/share` and `/share3d/`) serves the viewer + an "Apple 3D / AR" link
    (`rel="ar"`). Upload = anyone with access to the room, delete = admin. Links never
    expire for now; a link is a snapshot.

## Phases

| Phase | What | Status |
|---|---|---|
| H1 | **Export 3D** (first on the 3D toolbar, now Room › Export 3D…, desktop + phone): Wire, Doors (hide), Reset view | Built 2026-11-12, moved 2026-11-24, check pending |
| H2 | Doors swing open, drawers slide out (hinge / slide data in GLB extras) | — |
| H3 | Hide by group (overheads, benchtops, kicks, walls) via display layers; click a cabinet for its code + size | — |
| H4 | Export all rooms in a job, one file with a room picker (compressed GLBs) | — |
| H5 | Fully offline (three.js bundled + inlined, classic script); preview hint text | Built 2026-11-18, check pending |
| H6 | Export 3D menu: Share link (public bucket `share-3d`, `/share/3d/...`) + Apple USDZ | Built 2026-11-18, check pending |

## Files

- `src/lib/export3d/roomHtml.ts`: scene holder, GLB export, viewer template, download.
- `app/canvas/[roomId]/Room3DScene.tsx`: `SceneExportBridge` hands the live scene to
  `room3dScene` (dev also gets `window.__room3d.exportGLB()`).
- `app/canvas/[roomId]/CanvasClient.tsx`: `exportRoom3D()` + the Export 3D dialog
  (`data-tour="export-3d-html"` on the dialog, `export-3d-link` / `-file` / `-usdz` on its
  buttons; tutorial events `export_3d_html` / `_link` / `_usdz`). Menu item in
  `canvasMenuConfig.ts` (`openExport3D`).
- Test: `z_plan_automation/_tmp-export3d-menu.mjs <roomId> <outDir>` opens the dialog from the
  menu on desktop and a 390-wide phone, from the plan view, and saves the HTML file.
- `src/lib/export3d/viewer/main.ts` + `scripts/build-share3d-viewer.mjs` → `public/share3d/viewer.js`.
- `app/share/3d/[roomId]/[token]/route.ts`: hosted share page.
- `z_html_export/migration_h6_share_3d.sql`: bucket + policies (applied 2026-11-18).
- Tests: `z_plan_automation/_tmp-export3d-h6.mjs <roomId> <outDir>` (HTML offline + USDZ +
  no-JS preview), `_tmp-export3d-link.mjs <roomId> <outDir>` (share link, logged out).
- Old H1 test: `z_plan_automation/_tmp-export3d-btn.mjs <roomId> <outDir>` clicks the
  button headlessly, opens the file, screenshots solid / reset / no doors / wire.
