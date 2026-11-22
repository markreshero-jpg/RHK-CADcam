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

## Before every run: held-back parts (always)

Read the job's JOB-NOTES.md section **"Still to cut - held back from a nest"** (top of the file). Tell Mark what is
waiting (room, board, parts) and ask whether to add it to this nest — it's usually what makes a poor-yield board
worth cutting (RHK6478 R3: Buffet Teak 33 + 16 held for the next Teak rooms). When held parts are cut, strike their
row with the run number. When Mark holds a material back, add a row there AND a red boxed "NOT NESTED YET" text on
the room plan on the job's non-printing **Notes for Ai** CAD layer (so it shows on the canvas, never on prints).

## Before every run: pre-nest check (always)

`node z_plan_automation/prenest-check.cjs <job no> "<room>" ["<room>" …]` — read-only. Report every
line to Mark before nesting; sort the FIX lines first (ask how where it's a choice), confirm the
CHECK lines. It covers what rooms drawn before a rule miss (Mark 2026-11-15, RHK6581 J11 drawer
fronts not grain matched):
- woodgrain drawer banks (2+ fronts) with no grain-match group → one group per stack, vertical
- parts longer than the sheet → kick seams (Kick split › manual), split, or No CNC
- cabinets edited after their parts were resolved → re-resolve
- custom panels / fillers taped all four edges → back / wall edge untaped
- bulkheads without the +10 scribe (h_adjust), locked top hanging rails, No CNC parts to untick in Stage 2

- parts wider than the sheet (short side over sheet width − trim, e.g. RHK6478 Buffet WC-02 mirror back
  1439 x 1213 on a 1211 sheet → split across the width with `split.back_x`, z_cabinet_split S6)

When Mark answers a new "check this before nesting" question, add it to the script.

## After the nest (Stage 4), before stopping for Mark

- Unplaced parts: identify each (cabinet / part / size) and why — too long or too wide for the sheet.
- Poor-yield materials (1–2 sheets well under ~70 %, often Teak / veneer): suggest holding them for a later
  run with more rooms in that board (Mark 2026-11-22). To drop a material: Stage 2 material chip → Deselect
  shown → chip "All" → re-nest. Note held parts as "still to cut" in JOB-NOTES.
- Mention Stage 4 warnings (e.g. kick parts with tape but no tape thickness = nest undeducted).
- Hardware list for the run = only the run's rooms (`export-pick-list.mjs --only`, production-pdfs skill).

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
   Both are saved: `node z_plan_automation/cnc-receiver.mjs <scratch dir>` + paste
   `z_plan_automation/cnc-picker-shim.js` into the tab (re-paste after a reload).
5. Check before delivering: program headers `#1=` / `#2=` = the sheet size, cut sheets show the same
   file names, labels count = parts.

A tab reload loses the Stage 2–5 workspace (no persistence) — reopen a saved run instead.

## Headless (no layout edits needed)

`OPTI_RUN='{"project":"<id>","rooms":[…],"materials":[…],"out":"<dir>","keepRun":true,"byMaterial":true}' npx vitest run src/lib/optimiser/__tests__/headlessRun.test.ts --silent=false`
— filters match room / cabinet label / material NAME exactly. Point `out` at a scratch folder, then copy
into `C:\Users\mark\SynologyDrive\CNCFiles\…` as above. `nestOnly: true` writes the nest input only (a
quick look at the parts / sizes without making programs).

**Two sheet sizes in one board** (RHK6468 R1, 2026-11-17: 2415 sheets plus a few 2750 / 3100 for the long parts):
`"stock": {"<material NAME>": {"w": 3100, "h": 1211, "extra": [{"w": 2415, "h": 1211, "qty": 99}]}}`.
Put the LONG size as the standard and the 2415 as `extra` with a big qty: extra sizes go in the offcut pool,
which the nest opens first for any part that fits, so everything that fits a 2415 goes on 2415s and only the
long parts open long sheets (the other way round, big grain-match blocks use up the long sheets first and the
long parts come back unplaced). Extra sheets stay `isOffcut: false`, so their programs are named as full sheets;
check the `#1=` / `#2=` headers to count each size. Material names have an en dash (`PT Woodmatt 18mm – Blonde
Oak Woodmatt`) - write the JSON in a heredoc, don't sed it.
