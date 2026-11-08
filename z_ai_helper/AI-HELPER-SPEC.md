# AI Helper — In-App Chat That Changes Jobs

Status: **Scope drafted, not started** — waiting on Mark to confirm the open questions
Date: 2026-11-08
Related: `.claude/skills/draw-plan/` (today's drawing workflow, run from Claude Code),
`.claude/skills/draw-plan/references/canvas-api-bridge.md` (the dev-only
`window.__canvasApi` the helper's tools grow out of), `z_access_control/`,
`z_display_layers/DISPLAY-LAYERS-SPEC.md`.

## Goal

Move what Mark does today in Claude Code (in Cursor's terminal) — "draw this job",
"change the overhead doors to walnut", "add fillers at the inner drawers" — into a chat
panel inside the app. It works on the phone/iPad as well as the PC, applies the same shop
rules every time, and never needs a terminal.

## What it is / isn't

- **Is:** a helper that reads and changes **job data** — rooms, walls, cabinets,
  materials, fixtures, benchtops, kicks, CAD markup — through the same code paths the
  buttons use.
- **Isn't:** a code editor. Changes to how the app works (new cabinet types, resolver
  fixes, new features) stay in Claude Code. The in-app helper can't edit source.

## Scope switch (the core idea)

One helper, one panel. A scope chip at the top decides what it sees and what it may
change:

| Scope | Sees | May change | Example |
|---|---|---|---|
| **Selection** | The cabinets you've clicked | Only those cabinets | "Make these 600 deep, handles none" |
| **Room** | That room's walls, cabinets, fixtures, benchtops, markup | That room only | "Add 50 fillers at the inner drawers" |
| **Job** | A summary of every room; opens a room's detail only when needed | Any room in the job | "Change all overhead doors to Teak 16.5" |

- **Default follows what you're looking at:** cabinets selected → Selection; on a
  canvas → Room; on the project page → Job. One click to widen or narrow.
- **Smaller scope = faster and cheaper**, because less is sent to the model.
- **Scope is also the guardrail:** tools refuse to touch anything outside the scope. A
  Room-scoped chat can't change another room even if asked; it tells you to widen.

## How a request runs

1. You type (optionally attach a PDF plan, site sketch, photos).
2. The browser sends the message + scope to a server route (`app/api/ai/…` — check
   `node_modules/next/dist/docs/` for route handlers before building). The API key
   lives on the server only.
3. The server builds the context: shop rules + a compact summary of the scope
   (like `getState()` today) and calls Claude with a fixed set of **tools**.
4. Read tools run on the server (Supabase). **Change tools come back as a proposed
   change list** ("WC-03 door colour Teak → Walnut; WC-04 …").
5. You approve (all, or tick off individual lines) → the browser applies them through
   the real placement / update / resolve path, so the canvas updates live.
6. One **Undo** reverts the whole batch. Every applied batch is logged on the job.

## Tools (first cut)

Read: `get_job_summary`, `get_room_state`, `get_cabinet`, `list_library(codes, search)`,
`list_materials`, `get_issues` (resolver report), `get_takeoff`.

Change (proposed, then applied): `place_cabinet`, `update_cabinet` (dims, offset, doors,
handles, materials, scribes), `add_filler` / `add_end_panel`, `add_under_panel`,
`update_fixture`, `set_room_materials`, `add_markup` (TBC cloud, note, colour callout),
`draw_wall`.

Never: delete cabinets, walls or CAD (see "Never delete user CAD" — the helper marks
things TBC or asks instead), touch the cabinet library itself, touch other jobs.

The dev-only `window.__canvasApi` bridge is the starting point but is **disabled in
production**; this work turns those operations into real, permission-checked actions.

## Shop rules

Everything Claude Code knows today from the repo skills and memory — cabinet codes,
filler defaults (TFK, 50 at inner drawers), no finger pulls on overheads, overhead
scribe 0, markup standard, spec block content, benchtops one per wall, edge marks, etc.
— moves into an editable **Shop Rules** page in Settings. It's sent with every request
(prompt-cached, so it's cheap after the first message). Per-job notes (the
`JOB-NOTES.md` equivalents, e.g. "Dune: Teak 16.5 or 33 only, never 18") live on the job
and are sent when that job is in scope.

## Models and cost

- A fast model for Selection/Room edits and questions; the top model for drawing a
  room from a PDF and big job-wide changes. Pick the current IDs at build time.
- Runs on an Anthropic API key (pay per use), separate from the Claude Code plan.
- Log tokens + cost per request against the job, visible to admin.

## Access

Admin + tester only, like the rest of the app (`z_access_control/`). New tables get
RLS policies. No anon access.

## Phases

| # | Phase | Done when |
|---|---|---|
| AI1 | Chat panel + Room scope, **read-only** Q&A | "Total kick length in the Kitchen?" / "Which cabinets are TBC?" answer correctly in a few seconds |
| AI2 | Selection scope + cabinet edits, change list, approve, undo, history log | Edit 3 selected cabinets from chat, undo restores them exactly |
| AI3 | Room + Job scope bulk changes | "All overhead doors to Walnut" across a job, previewed and applied |
| AI4 | Drawing from PDF / site sketch in the app | A room drawn from a plan matches what the draw-plan skill produces |
| AI5 | Shop Rules editor, per-job notes, cost log | Rules editable in Settings and visibly followed |

Each new user-facing phase gets a tutorial lesson (`src/lib/tutorial/lessons.ts`).

## Open questions (Mark)

1. **Approve every change, or let small ones apply straight away?** Proposal: Selection
   edits on ≤ 3 cabinets apply immediately (with Undo); anything bigger shows the list.
2. **Chat history per room, per job, or one running chat?** Proposal: one thread per job,
   scope chip per message, so a job's history is in one place.
3. **Phone first or PC first?** Panel layout differs a lot on the iPhone canvas.
4. **Who else uses it?** If testers use it, should they be limited to Selection/Room?
5. **Monthly spend cap** on the API key?
