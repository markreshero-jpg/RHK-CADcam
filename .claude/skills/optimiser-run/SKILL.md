---
name: optimiser-run
description: Run the panel optimiser for a job (nest, G-code, cut sheets, labels) and deliver the files to the CNC folder. Use when Mark asks to "run the optimiser", "put it to the machine", nest a room / material / set of parts, use offcuts, do a recut, or save programs, labels or cut sheets.
---

# Optimiser run → CNC files

## Where the files go (always)

**`C:\Users\mark\SynologyDrive\CNCFiles\`** — the local Synology Drive copy of CNC Files. It is always
reachable from this machine (the `\\server\Data\CNCFiles` share often isn't — don't use it).
Synology syncs it to the server for the machine.

```
C:\Users\mark\SynologyDrive\CNCFiles\<job folder>\<room or run folder>\<material folder>\
    <program>.anc …                   one per sheet (A/Z pair for a 6th-face sheet)
    <job> cut sheets.pdf
    <job> labels 102x48.pdf
    <job>-R<n>.rhkrun
```

- `<job folder>` = the existing folder for the job, e.g. `RHK6581 - Lee Smith - 38 Howard St, Grange`.
  Look first and reuse what's there (Mark files done runs into `done` sub folders — leave those alone).
- Material folder names follow what's already in the job, e.g. `18mm Lx Elegant Oak ABS Grain`, `16mm Whiteboard`.
- **Offcut sheets:** give each sheet its own sub folder (`Offcut 1600 x 330`, `Offcut 910 x 600`,
  `Full sheet 2415 x 1211`) holding its program; PDFs + .rhkrun stay in the material folder. Offcut
  programs are named `…_NN_OC_<w>_x_<h>.anc` by the app (gcodeFileName `offcut`).
- **Re cuts:** `<job folder>\Re cuts\<material>\`.
- Never overwrite an existing run's files; if a folder for the run already exists, stop and ask.

## In the browser (Mark's layout, Stage 5 edits)

App: `https://rhk-cadcam.vercel.app/projects/<projectId>/optimiser` (claude-in-chrome).
1. Stage 2: search box filters the list (e.g. "Linear Handle"); Deselect all, then Select shown.
2. Stage 3: stock per material. **Offcuts:** `+ Offcut`, set W/H (W = along the grain), and set the
   full-sheet Qty to **0** so the nest packs the offcuts first; re-nest (Best). Whatever doesn't fit comes
   back unplaced → Stage 5 `+ Sheet` (full size) and click the unplaced part, then drag it to an edge.
   Stage 5 "Move to sheet…" places loosely — don't use it to fill an offcut.
3. Stage 6 Generate → reserves the run number and saves the run. Reopen (Stage 1) + Regenerate keeps
   the run number (use it after a deploy changes naming).
4. Saving: Download all / Download PDF use the File System Access pickers, which the extension can't
   drive. Run a local receiver (node http server on 127.0.0.1:8765, CORS for the vercel origin +
   `Access-Control-Allow-Private-Network: true`, `POST /save?name=` writes the body) and replace
   `window.showDirectoryPicker` / `showSaveFilePicker` in the tab with fakes whose
   `createWritable().close()` POSTs the blob. Save to a scratch folder, check, then copy into CNCFiles.
5. Check before delivering: program headers `#1=` / `#2=` = the sheet size, cut sheets show the same
   file names, labels count = parts.

A tab reload loses the Stage 2–5 workspace (no persistence) — reopen a saved run instead.

## Headless (no layout edits needed)

`OPTI_RUN='{"project":"<id>","rooms":[…],"materials":[…],"out":"<dir>","keepRun":true,"byMaterial":true}' npx vitest run src/lib/optimiser/__tests__/headlessRun.test.ts --silent=false`
— filters match room / cabinet label / material NAME exactly. Point `out` at a scratch folder, then copy
into `C:\Users\mark\SynologyDrive\CNCFiles\…` as above. `nestOnly: true` writes the nest input only (a
quick look at the parts / sizes without making programs).
