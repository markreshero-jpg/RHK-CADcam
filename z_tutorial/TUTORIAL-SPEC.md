# Tutorial Mode — interactive lessons for new users

Status: **T1–T3 + T5–T7 (levels tree, search, 8 more tutorials incl. CAD notes) built 2026-10-18, pending in-app check**
Date: 2026-10-18

## Goal

A new user switches on **File → Tutorial mode** and picks a tutorial: the
Getting started course (create a job, walls, cabinets, benchtops, appliances,
views) or a "how do I…" topic (join benchtops in a corner, shaped cabinet, …).
Each step ticks itself off when the user actually does it. Hints are drawn on the
plan to show *where* to do it.

## Locked decisions (2026-10-18)

1. **Toggle lives in the canvas File menu** ("Tutorial mode", checked when on). The
   panel has its own ✕ (turns it off). No first-login prompt, no Help-page version.
2. **Interactive, not a reading page.** Steps advance only when the app state says
   the user did the thing. Skip / Back buttons are there for people who already know.
3. **On-canvas hints** (pulsing wall outline, target zones, labels) — plan view only
   for now. They go through the display-layer registry as `tutorial_hints`
   (group Labels, plan only, default on) and only draw while tutorial mode is on.
4. **The user's own job** — no seeded practice job. Lesson 1 sends them back to
   Projects to create one (New Project is admin-only today, so testers skip lesson 1).
5. **Per-user, per-browser state** in `userPrefs.tutorial` (localStorage): on/off,
   current lesson + step, completed steps, minimised (survives a reload; turning
   tutorial mode on from the File menu unfolds it). No new table.
6. **No tour library.** Targets are `data-tour="…"` attributes; a small spotlight ring
   (pointer-events none, so it never blocks the click) is drawn around the target.
7. **Tutorial picker** (Mark 2026-10-18): turning tutorial mode on opens a picker of
   every tutorial, grouped (Getting started / Benchtops / Cabinets / Room), ticked when
   finished, "in progress" on the one part-done. "☰ All" in a lesson goes back to it.
   Getting started is a course — finishing a lesson offers the next one; a topic
   tutorial goes back to the picker when done.
9. **Levels ▸ topics tree + search** (Mark 2026-10-18, "the tutorials will get quite
   large"): top level Getting started / Basics / Intermediate / Advanced, each a
   collapsible branch; under Basics–Advanced a topic branch (Room, Cabinets, Benchtops,
   Appliances & fixtures, CAD notes & markup, Reports & printing, Production). Branches show done/total.
   A search box above the tree filters to a flat list (every word must match title,
   blurb, `keywords` or a step title), each hit with its "Level › Topic" crumb.
8. **Steps count from the lesson's start** — `done(ctx, start)`: `start` is the canvas
   when the lesson began, so "add a top" in a job that already has tops needs one
   more, not any. Not persisted: a reload re-takes it from the drawing as it is then.
10. **New features get a tutorial** (Mark 2026-10-18: "can you just take it and i see
   what you come up with"). When a user-facing canvas feature lands, Claude writes its
   tutorial without asking: append a lesson, add the data-tour targets / ctx fields it
   needs, add a store test, and list it below. Mark reviews it in-app afterwards.

## Architecture

| File | Role |
|---|---|
| `src/lib/tutorial/lessons.ts` | `LESSONS` (+ `level`, `topic`, `blurb`, `keywords`), `TUTORIAL_LEVELS`, `TUTORIAL_TOPICS`, `searchLessons(q)`. Each step: `title`, `body`, `target?` (data-tour id, `a|b` = first one on screen), `canvas?`, `done(ctx, start)`, `hints?(ctx)` |
| `src/lib/tutorial/store.ts` | zustand store: `enabled`, `lesson`, `step`, `done[]` (persisted) + live `ctx`, `start`, `picking`; auto-advances when the current step's `done` turns true |
| `src/components/tutorial/TutorialHost.tsx` | Mounted in the root layout. Feeds the route into ctx, renders the panel + spotlight when enabled |
| `src/components/tutorial/TutorialPanel.tsx` | Floating card (bottom-right): picker view / lesson view (steps with ticks, Back · Show me · Skip) |
| `src/components/tutorial/TutorialSpotlight.tsx` | Ring around `[data-tour=<target>]`, follows it every frame |
| `app/canvas/[roomId]/TutorialHintsPlan.tsx` | Plan-view hints inside CanvasSVG's world transform (`tutorialLayer` slot), gated by `layers.show('tutorial_hints')` |
| `CanvasClient.tsx` | Publishes `ctx` to the store (after `useBenchtopInteraction`, for the pick / join-dialog state) |

### Ctx (what steps check)

`path`, `inCanvas`, `mode`, `view`, `walls`, `cabinets`, `benchtops`, `fixtures`,
`selected`, `cabEditorOpen`, `pickedTops` (Shift-picked tops in F4), `joinDialogOpen`,
`kickSettingsOpen`, `report` (id open in the Reports window, set by ReportsModal),
`events` (counters bumped by `useTutorial.getState().emit(name)` — `elevation_pdf`,
`plan_pdf` from the report Download buttons, `annot_style` from CadRibbon style
changes), `annotations` (plan CAD notes) + `annotSelected` (fed after `useAnnotationTool`).
Only the **current** step's `done` is evaluated, so steps are ordered and a
completed step stays completed. Canvas steps wait until the canvas is open.

### data-tour targets

`new-project` (Projects header), `project-name` (New Project form), `menu-<Group>`
(every canvas menubar group; the phone "Menu" button is `menu-File`), `tool-wall`,
`tool-cabinet`, `tool-benchtop`, `tool-fixtures` (sidebar section headers, via
`SectionHeader tour=`), `mode-<Mode>` (wall + benchtop tool rows, via `ToolRow tour=`),
`cab-shape` (cabinet panel Shape select), `report-<ReportId>` (Reports window list),
`elev-download` / `plan-download` (report PDF buttons), `view-plan` / `view-elevation` /
`view-section` / `view-3d`, `tool-cad` (sidebar CAD header), `cad-<CadTool>` (ribbon tool
buttons: `cad-select`, `cad-text`, `cad-textbox`), `cad-colour` (ribbon colour group). Never rename one without updating `lessons.ts`.

Tests: `src/lib/__tests__/tutorialStore.test.ts` (picker on enable, step order +
course run-on, counting from the start, canvas steps wait outside it, corner join
end to end, island cabinets, benchtop hint zone, unique ids).

## Tutorials

Lesson order in `LESSONS` is **append only** (the index is persisted); the picker
orders by level / topic, not array position.

| Level › Topic | Tutorial | Steps |
|---|---|---|
| Getting started | Start a job | Back to Projects → New Project → name it + Create (lands in the canvas) |
| | Draw the walls | Wall tool → draw ≥ 2 walls → back to Select |
| | Place cabinets | Arm a cabinet → drop a base (hint: longest wall) → 3 more → open the cabinet editor → add a wall cabinet |
| | Benchtops | Line + Offset → top over the run (hint: the base run) → one top per wall with bases |
| | Appliances | Pick an appliance → drop it (hint: end of the base run) |
| | Look at your job | Elevation → 3D → back to Plan |
| Basics › Room | Draw an island | Wall → Island → draw it → drop a base on the island line (hint) |
| | Doors and windows | Fixtures → Doors & windows → drop in a wall (hint) → select it (size / sill) |
| Basics › Cabinets | Copy and paste a cabinet | Select → Ctrl+C (paste mode) → drop the copy |
| Basics › Benchtops | Sink or cooktop cutout | Have a top → pick a sink → drop it on the top → select it (Cut benchtop tick) → 3D |
| Basics › CAD notes | Notes on the plan (F7 CAD) | F7 → Text (a point note) → Text box (a note with a width) → Select a note → change its style on the ribbon (`annot_style`) → leave CAD mode |
| Intermediate › Cabinets | Make a shaped cabinet | Select a base → Shape preset (footprint set) → sizes + 3D |
| | Join kicks along a run | ≥ 2 bases on a wall (hint) → right-click → Join kicks in run (new kick_run_id) → Elevation → right-click the kick → Kick split… |
| Intermediate › Benchtops | Join benchtops in a corner | L corner → Line + Offset → top 1 + top 2 into the corner (hints) → Shift-pick both → right-click → Join benchtops → Apply (joint edge appears) |
| | Edge profiles | Have a top → right-click → Edit edges → paint an edge + save |
| Intermediate › Reports | Print elevations | Reports → Room Reports… → Elevation Views → Download PDF (`elevation_pdf`) |
| | Print the plan | Reports → Room Reports… → Plan View → Download PDF (`plan_pdf`) |
| Advanced › Benchtops | Reshape a benchtop | Have a top → right-click → Edit shape → change the outline + save (a top's segments differ from the start) |
| Advanced › Production | Cut list and CNC | Production → Generate CNC… (path ends /optimiser) → back to the canvas |

## Phases

- **T1** ✅ store, lessons, panel, File-menu toggle, ctx feed, lessons 1–3.
- **T2** ✅ spotlight + data-tour attributes.
- **T3** ✅ lessons 4–6 + plan hints (`tutorial_hints` layer item).
- **T5** ✅ picker, groups, start-relative steps, 5 topic tutorials.
- **T6** ✅ levels ▸ topics tree, search box, 7 more tutorials (doors & windows, copy /
  paste, kick runs, print elevations, print plan, reshape a top, CNC).
- **T7** ✅ CAD notes tutorial (z_CAD_tool A2: text + text boxes). Extend it, or add a
  lesson, as A3+ lands (leaders, lines, arrows, dimensions, elevation notes, sheets).
- **T4** not started: headless script per lesson (`z_plan_automation/verify-tutorial.mjs`)
  that walks the lessons and checks each step ticks; elevation / 3D hints if wanted.
- Ideas for more topics: layer sets (Manage Layers), cabinet editor doors / drawers,
  split a cabinet, job / room construction defaults, multiple rooms, cabinet sheets report.
