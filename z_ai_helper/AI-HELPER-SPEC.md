# AI Helper — In-App Chat That Changes Jobs

Status: **Scope agreed, not started** — streamlined design locked 2026-11-08, next is AI0
Date: 2026-11-08
Related: `.claude/skills/draw-plan/` (today's drawing workflow, run from Claude Code),
`.claude/skills/draw-plan/references/canvas-api-bridge.md` (the dev-only
`window.__canvasApi` whose operations become server actions here), `z_access_control/`,
`z_display_layers/DISPLAY-LAYERS-SPEC.md`.

## Goal

Move what Mark does today in Claude Code (in Cursor's terminal) — "draw this room",
"change the overhead doors to walnut", "add fillers at the inner drawers" — into a chat
panel inside the app, for Mark and testers, at a running cost of roughly **$20–40 a
month for 3–4 people**.

## What it is / isn't

- **Is:** a helper that reads and changes **job data** — rooms, walls, cabinets,
  materials, fixtures, benchtops, kicks, CAD markup.
- **Isn't:** a code editor. Changes to how the app works stay in Claude Code.
- **Isn't on-screen drawing.** The AI never sees or drives the canvas. It returns
  instructions; server code applies them and saves to Supabase; any open canvas shows
  the result.

## Core principle: the AI states the intent, code does the work

This is what keeps it cheap, fast and repeatable:

- The AI gets a **compact summary**, not the full job.
- It answers with **one bulk instruction** (e.g. "where class = overhead: door colour =
  Walnut"), not one call per cabinet.
- **Server code expands and applies it** through the app's real placement / update /
  resolve functions — the same ones the buttons use. Never raw table inserts (they skip
  parts, cut-outs, fixture links — burned before on fixtures).
- Fewer round trips + smaller context = most of the cost saving.

## Scope switch

One helper, one panel. A scope chip decides what it sees and may change:

| Scope | Sees | May change | Example |
|---|---|---|---|
| **Selection** | The cabinets you've clicked | Only those | "Make these 600 deep, handles none" |
| **Room** | That room | That room only | "Add 50 fillers at the inner drawers" |
| **Job** | One-line summary per room; room detail on request | Any room in the job | "Change all overhead doors to Teak 16.5" |

- Default follows what you're looking at (selection → Selection, canvas → Room, project
  page → Job); one click to change.
- **Scope is enforced by the server**, not just the prompt: a filter that reaches outside
  the scope is refused and the helper says to widen it.

## Context: the compact summary

Sent with each request (built server-side, deterministic order so it caches):

- **Room summary**, one line per item, roughly 2–4K tokens for a full kitchen:
  `WC-03 | W2 | Wall 2 @ 1200 | 600×720×330 | door Teak 16.5 | handle none | carcass WB 16.5`
  plus walls (name, length, angle), fixtures, benchtops, kick runs.
- **Job summary** (Job scope): one line per room — name, cabinet count, main colours.
- **Never sent:** parts, drilling, edge banding, geometry. Available on request via
  `get_cabinet_detail`.
- **Shop rules + tool list** at the front, frozen, prompt-cached (≈10% of normal price
  after the first message).

## Tools

Read (cheap, on demand): `get_room_summary(room)`, `get_cabinet_detail(label)`,
`find_library(search | codes)`, `list_materials(search)`, `get_issues(room)`,
`get_takeoff(room)`.

Change — **bulk by filter**:

- `update_cabinets(filter, changes)` — one call for any number of cabinets.
  - `filter`: `{ room?, wall?, class?, codes?, labels?, where?: [{field, op, value}] }`
  - `changes`: whitelisted fields only — dims, offset, door/drawer colour, carcass board,
    handle, scribes, kick, fillers-at, etc.
- `place_cabinets([{ code, wall, offset, dx?, dy?, dz?, … }])` — a whole run in one call.
- `add_fillers([...])`, `add_under_panel(labels)`, `update_fixtures([...])`,
  `add_markup([...])` (TBC cloud, note, colour callout), `draw_walls([...])`.
- `apply_room_plan(plan)` — see Drawing below.

Conversation: `ask_user(question, options[])` — option buttons + "Other" in the panel.

**Never:** delete cabinets, walls or CAD (the helper marks TBC or asks instead — see
"Never delete user CAD"), touch the cabinet library, touch other jobs.

## How a request runs

1. You type (optionally attach a PDF / site sketch / photo).
2. Browser sends message + scope to the server route (`app/api/ai/…` — read
   `node_modules/next/dist/docs/` for route handlers before building). API key is
   server-only.
3. Server picks the model (below), builds shop rules + compact summary, calls Claude.
4. Claude replies with an answer, a question (`ask_user`), or bulk change instructions.
5. Server **expands** each instruction into the concrete cabinet list and validates it
   (scope, whitelist, codes exist).
6. Small change (≤ 3 cabinets, Selection scope) → applies straight away. Bigger → the
   panel shows the expanded list ("WC-03 door Teak → Walnut …") to approve or untick.
7. Applied through the real update/resolve code, saved as **one batch** with a
   before-snapshot → one **Undo** reverts it. Batch logged on the job's history.
8. Open canvases refresh the changed items.

Typical round trips: question = 1, edit = 1–2, job-wide change = 2–3.

## Model routing

| Request | Model | Why |
|---|---|---|
| Questions, simple edits | Claude Haiku 5.5 | ~20× cheaper; the summary + bulk tools make these easy |
| Trickier edits, job-wide changes, anything Haiku gets wrong | Claude Sonnet 5.5 | More judgment |
| Drawing a room from a PDF / sketch | Claude Opus 5.5 | Reading plans is the hard part |

Start simple: the server routes by request kind; a **"Try harder"** button re-runs the
last request on the next model up. If Haiku proves unreliable for edits in testing,
edits move to Sonnet (cost lands nearer the top of the range).

## Drawing from a PDF (AI4)

The AI does **not** place cabinets one by one. It reads the plan and returns **one
structured room plan**:

```
{ walls: [{ name, x, y, length, angle, height }],
  runs:  [{ wall, items: [{ code, offset, dx, dy?, dz?, notes? }] }],
  fixtures: [...], tbc: [{ near, note }] }
```

`apply_room_plan` validates it (codes exist, runs fit the wall, no overlaps), shows a
preview, and places everything through the real placement code. Problems come back as
a short list for the AI (or you) to fix — 1–2 calls per room, not 50.

## Cost (2026-11-08 prices — check against the cost log after the first month)

Per million tokens: Haiku 5.5 $0.10 in / $0.50 out; Sonnet 5.5 $2 / $10; Opus 5.5 $4 /
$20; cached input ~10% of normal.

| Kind | Model | Each | ~Monthly, 4 people × ~20/day |
|---|---|---|---|
| Question | Haiku | ~0.2c | ~$2 |
| Small edit | Haiku / Sonnet | ~1–2c | ~$10–15 |
| Job-wide change | Sonnet | ~5c | ~$5–10 |
| Draw a room from PDF | Opus | ~50c–$1 | ~$5–10 (≈10 rooms) |
| **Total** | | | **~$20–40** |

- **Hard cap US$50/month** on the API key (Anthropic Console). When it's hit the helper
  says so instead of failing silently.
- Every request logs model, tokens and cost against the job and user; admin sees a
  monthly total.

## Access

- Admin + tester only, as the rest of the app (`z_access_control/`).
- **Every read and write runs as the signed-in user** (their Supabase session, RLS
  applies) — never the service-role key. Testers are already limited to their assigned
  (sample) jobs by `project_access`, so their helper can't reach anything else.
- New tables (chat threads, messages, batches, cost log) get RLS policies.

## Locked decisions (Mark, 2026-11-08)

1. **Small edits apply straight away** with Undo; bigger ones show the change list.
   Starting rule ≤ 3 cabinets in Selection scope — tune with use.
2. **Clarifying questions with clickable answers** (Claude Code style) when a request is
   ambiguous or big — not for every small edit.
3. **Chat history per job** — one thread; each message records its scope.
4. **PC first** — panel docked on the right of the canvas; iPhone later.
5. **Testers get full scope** (Selection / Room / Job); limited by job access, not scope.
6. **Streamlined design** — compact summary, bulk-by-filter tools, server expands and
   applies, model routing, drawing via one room plan. Target $20–40/month, $50 cap.

## Phases

| # | Phase | Done when |
|---|---|---|
| AI0 | **Server actions**: placement / update / resolve callable server-side (from what `window.__canvasApi` does in the browser today); compact summary builder; batch + undo tables | A script can update 12 cabinets by filter server-side and undo it, matching what the UI produces |
| AI1 | Chat panel + Room scope, **read-only** Q&A on Haiku; cost log | "Total kick length in the Kitchen?" / "Which cabinets are TBC?" correct in a few seconds, cost logged |
| AI2 | Selection scope edits, `ask_user`, auto-apply small / approve big, Undo, history | Edit 3 selected cabinets from chat; Undo restores them exactly |
| AI3 | Room + Job scope bulk changes, Sonnet routing, "Try harder" | "All overhead doors to Walnut" across a job, previewed and applied in ≤ 3 round trips |
| AI4 | Drawing via `apply_room_plan` from PDF / sketch on Opus | A room drawn from a plan matches what the draw-plan skill produces |
| AI5 | Shop Rules editor in Settings, per-job notes, admin cost view | Rules editable and visibly followed; monthly total shown |

Each user-facing phase gets a tutorial lesson (`src/lib/tutorial/lessons.ts`).

## Shop rules

Everything Claude Code knows today from the repo skills and memory — cabinet codes,
filler defaults (TFK, 50 at inner drawers), no finger pulls on overheads, overhead
scribe 0, markup standard, spec block content, benchtops one per wall, edge marks —
becomes an editable **Shop Rules** page in Settings (AI5; seeded as a fixed text before
then). Per-job notes (the `JOB-NOTES.md` equivalents, e.g. "Dune: Teak 16.5 or 33 only,
never 18") live on the job and are sent when that job is in scope. Keep both short —
they're sent on every request.

## Open items (check while building)

- Whether placement/resolve code has browser-only dependencies that block running it
  server-side (AI0's first job).
- How open canvases learn about changes (existing realtime channel vs refresh).
- Haiku's reliability on edits — measure in AI2 before committing to it.
