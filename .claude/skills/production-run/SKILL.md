---
name: production-run
description: Full release of a job / rooms to production in one go — optimiser to Stage 5, STOP for Mark to check the layout, then Stage 6 + 7, save every machine file to CNCFiles, then save the shop drawings (Line Drawing Print) and KICK PLAN PDFs to the job's PDF\Production folder. Use when Mark says "production run", "do the lot", "release <room> to production", or asks for optimiser + shop drawings + kick plan together.
---

# Production run (Mark, 2026-11-18)

One pass, one pause. Follow the two underlying skills for the detail — this file is the order and the
gate. Read both before starting:
- `.claude/skills/optimiser-run/SKILL.md` — prenest check, browser stages, CNCFiles layout, checks
- `.claude/skills/production-pdfs/SKILL.md` — PDF names, folder, Notes for Ai layer, checks

Running this skill IS Mark's request for the production PDFs (it overrides "not automatically after an
optimiser run" in production-pdfs).

## 0. Get the inputs (ask once, up front, only what's missing)

Job no, room(s), material(s) if not all, offcuts to use. Find the projectId and roomIds, the CNCFiles job
folder (`ls -d /c/Users/mark/SynologyDrive/CNCFiles/RHK<no>*`) and the _JOBS folder
(`ls -d /c/Users/mark/SynologyDrive/_JOBS/*/RHK<no>*`). If a run folder or PDF name already exists, stop
and ask — never overwrite.

## 1. Held-back parts + pre-nest check

First read JOB-NOTES "Still to cut - held back from a nest" and offer to add those parts to this run
(optimiser-run skill › held-back parts). Then:

`node z_plan_automation/prenest-check.cjs <job no> "<room>" …` — report every line, FIX lines first.
Don't nest until the FIX lines are sorted or Mark says go.

## 2. Optimiser Stages 1–5 (browser, so Mark can look)

claude-in-chrome, new tab: `https://rhk-cadcam.vercel.app/projects/<projectId>/optimiser`.
Stage 1 rooms → Stage 2 parts (untick No CNC) → Stage 3 stock / offcuts → Stage 4 nest (Best) → Stage 5.

Look at Stage 4 before stopping: unplaced parts (the banner names them — find the part in the DB and say
why: too long OR too wide for the sheet), and any material with only 1–2 poorly used sheets (e.g. RHK6478 R3:
Teak 33 at 53 % / 44 %, Teak 16 at 60 % / 4 %). Point those out with a suggestion — Mark held the Teak back
for a later run with more Teak rooms (2026-11-22): untick that material in Stage 2 (material chip → Deselect
shown), re-nest, and note "still to cut" in JOB-NOTES.

## 3. ⛔ STOP — Mark checks Stage 5

End the turn. Tell Mark: tab is on Stage 5, sheet count per material, sheet sizes, unplaced parts (should
be none), anything odd (squeezed grain blocks, small parts at 80, pairs). Wait for "ok" / edits.
Don't reload the tab — Stage 2–5 work is lost on reload. If Mark moves parts himself, take the tab as he
leaves it.

## 4. Stages 6 + 7 (after Mark says ok)

1. Stage 6 Generate → note the run number (R<n>).
2. Start the receiver into a scratch folder (background):
   `node z_plan_automation/cnc-receiver.mjs "<scratchpad>/cnc-R<n>"`
3. In the tab run `z_plan_automation/cnc-picker-shim.js` (javascript_tool, paste the file's contents).
4. Stage 7: Download all (programs, by material) + cut sheets PDF + labels PDF + .rhkrun.
5. Check (optimiser-run "Check before delivering"): `#1=` / `#2=` headers = sheet sizes, cut sheet file
   names = program names, label count = part count.
6. Copy into `C:\Users\mark\SynologyDrive\CNCFiles\<job folder>\<room / run folder>\<material folder>\`
   (offcuts in their own sub folders). Stop the receiver.

## 5. Production PDFs

Dev server on localhost:3001 (else ask Mark to `! npm run dev`). "Notes for Ai" layer print = false.
Shop drawings (Line Drawing Print) + KICK PLAN (plan_view_v2, Kicks set) via
`z_plan_automation/export-shop-drawings.mjs`, all the run's rooms in one PDF each, checked with pymupdf,
copied to `…\_JOBS\<range>\<job folder>\PDF\Production\` under the folder's naming.
Hardware pick list too when Mark asks for it: `export-pick-list.mjs … --only "<Room>"` for **only the run's rooms**
(production-pdfs › Hardware pick list) → `<name> HARDWARE PICK LIST.pdf`.

## 6. Report

Run number, sheet count per material, the CNCFiles folder, the two PDF full paths. Update the job's
JOB-NOTES.md / job memory with the run number.
