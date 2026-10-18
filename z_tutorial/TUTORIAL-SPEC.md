# Tutorial Mode — interactive lessons for new users

Status: **T1–T3 built 2026-10-18, pending in-app check**
Date: 2026-10-18

## Goal

A new user switches on **File → Tutorial mode** and is walked through a real job:
create the job, draw walls, place cabinets, draw benchtops, drop appliances, then
look at it in elevation and 3D. Each step ticks itself off when the user actually
does it. Hints are drawn on the plan to show *where* to do it.

## Locked decisions (2026-10-18)

1. **Toggle lives in the canvas File menu** ("Tutorial mode", checked when on). The
   panel has its own Exit button. No first-login prompt, no Help-page version.
2. **Interactive, not a reading page.** Steps advance only when the app state says
   the user did the thing. Skip / Back buttons are there for people who already know.
3. **On-canvas hints** (pulsing wall outline, target zones, labels) — plan view only
   for now. They go through the display-layer registry as `tutorial_hints`
   (group Labels, plan only, default on) and only draw while tutorial mode is on.
4. **The user's own job** — no seeded practice job. Lesson 1 sends them back to
   Projects to create one (New Project is admin-only today, so testers skip lesson 1).
5. **Per-user, per-browser state** in `userPrefs.tutorial` (localStorage): on/off,
   current lesson + step, completed steps. No new table.
6. **No tour library.** Targets are `data-tour="…"` attributes; a small spotlight ring
   (pointer-events none, so it never blocks the click) is drawn around the target.

## Architecture

| File | Role |
|---|---|
| `src/lib/tutorial/lessons.ts` | Lesson + step data. Each step: `title`, `body`, `target?` (data-tour id), `done(ctx)`, `hints?(ctx)` |
| `src/lib/tutorial/store.ts` | zustand store: `enabled`, `lesson`, `step`, `done[]`, live `ctx`; persists to userPrefs; auto-advances when the current step's `done(ctx)` turns true |
| `src/components/tutorial/TutorialHost.tsx` | Mounted in the root layout. Feeds the route into ctx, renders the panel + spotlight when enabled |
| `src/components/tutorial/TutorialPanel.tsx` | Floating card (bottom-right): lesson picker, step list with ticks, Show me / Back / Skip / Exit |
| `src/components/tutorial/TutorialSpotlight.tsx` | Ring around `[data-tour=<target>]`, follows it on resize/scroll |
| `app/canvas/[roomId]/TutorialHintsPlan.tsx` | Plan-view hints inside CanvasSVG's world transform (`tutorialLayer` slot), gated by `layers.show('tutorial_hints')` |
| `CanvasClient.tsx` | Publishes `ctx` (walls, cabinets, benchtops, fixtures, mode, view, editor open) to the store |

### Ctx (what steps check)

`path`, `inCanvas`, `mode`, `view`, `walls`, `cabinets`, `benchtops`, `fixtures`,
`cabEditorOpen`. Only the **current** step's `done` is evaluated, so steps are
ordered and a completed step stays completed.

### data-tour targets

`new-project` (Projects header), `project-name` (New Project form), `menu-<Group>`
(every canvas menubar group; the phone "Menu" button is `menu-File`), `tool-wall`,
`tool-cabinet`, `tool-benchtop`, `tool-fixtures` (sidebar section headers, via
`SectionHeader tour=`), `view-plan` / `view-elevation` / `view-section` / `view-3d`.
Never rename one without updating `lessons.ts`.

Tests: `src/lib/__tests__/tutorialStore.test.ts` (step order, lesson-1 skip inside a
job, canvas steps wait outside it, benchtop hint zone).

## Lessons

| # | Lesson | Steps |
|---|---|---|
| 1 | Start a job | Back to Projects → New Project → name it + Create (lands in the canvas) |
| 2 | Draw the walls | Wall tool → draw ≥ 2 walls → back to Select |
| 3 | Place cabinets | Cabinet library, arm a cabinet → drop a base on a wall (hint: longest wall) → 3 bases → open the cabinet editor (double-click) → add a wall cabinet |
| 4 | Benchtops | Benchtop → Line + Offset → top along the first run (hint: the base run) → one top per wall with bases (joint edges at corners) |
| 5 | Appliances | Fixtures, pick an appliance → drop it (hint: end of the base run) |
| 6 | Look at it | Elevation → 3D → back to Plan |

## Phases

- **T1** ✅ store, lessons, panel, File-menu toggle, ctx feed, lessons 1–3.
- **T2** ✅ spotlight + data-tour attributes.
- **T3** ✅ lessons 4–6 + plan hints (`tutorial_hints` layer item).
- **T4** not started: headless script per lesson (`z_plan_automation/verify-tutorial.mjs`)
  that walks the lessons and checks each step ticks; elevation / 3D hints if wanted.
