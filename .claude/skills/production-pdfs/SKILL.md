---
name: production-pdfs
description: Save a job's production PDFs — shop drawings (Line Drawing Print) and the KICK PLAN (Kicks layer set, plan only) — into the job's _JOBS …\PDF\Production folder. Use when Mark asks to "save shop drawings", "production drawings", "kick plan", or to put a room's drawings in the PDF / Production folder.
---

# Production PDFs → job folder

Only when Mark asks (not automatically after an optimiser run — Mark 2026-11-15).

## Where they go

`C:\Users\mark\SynologyDrive\_JOBS\<range>\<job folder>\PDF\Production\` — e.g.
`_JOBS\RHK6500 - 6599\RHK6581 - Lee Smith- 38 Howard St Grange\PDF\Production\`. Find the job folder with
`ls -d /c/Users/mark/SynologyDrive/_JOBS/*/RHK<no>*` (the _JOBS folder name can differ from the CNC one).

Two PDFs per batch of rooms, all rooms of the batch in ONE PDF, named like the ones already there:

| PDF | Report | Layer set | Name |
|---|---|---|---|
| Shop drawings | Shop Drawings (plan + elevations + 3D per room) | **Line Drawing Print** | `RHK<no> - <Client> - <J codes> <room names>.pdf` |
| Kick plan | Plan View only (one plan page per room) | **Kicks** | same name + ` KICK PLAN.pdf` |

e.g. `RHK6581 - Lee Smith - J11 J12 WIR and Master Store.pdf` + `… KICK PLAN.pdf`. Look at the folder's
existing names first and match them. Never overwrite a file that's there — if the name exists, ask
(Mark moves old ones to `_Superseeded`).

## How

Needs the dev server on `http://localhost:3001` (`curl -s -o /dev/null -w "%{http_code}" localhost:3001`
→ 200 / 307). If it's down, ask Mark to run `! npm run dev`.

```
O=<scratchpad>/shop
node z_plan_automation/export-shop-drawings.mjs <any roomId of the job> "$O" --one --only "<Room name>" --only "<Room name>"
O=<scratchpad>/kick
node z_plan_automation/export-shop-drawings.mjs <any roomId of the job> "$O" --one --report plan_view_v2 --set Kicks --only "<Room name>" --only "<Room name>"
```

- `--only` takes the room names exactly as the app shows them (`WIR J11`, `Master Store J12`).
- Default set is Line Drawing Print; `--set` changes it. `--report plan_view_v2` = plan only.
- The app names them `Shop_Drawings-<job>-<n>-rooms.pdf` / `Plan_View-<job>-<n>-rooms.pdf`; copy to the
  Production name.

## Check before copying

Open with pymupdf (`python -I`): page count + first line per page (`<Room> Plan / Elevation Wall n / 3D`),
render a page or two to PNG and look — black line drawing with the title block (shop drawings); kick
lengths, depths and `KICK H` on the kick plan. Tell Mark the two full paths when done.
