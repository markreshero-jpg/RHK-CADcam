# AI Helper — In-App Chat That Changes Jobs

Status: **AI0 – AI4 built 2026-11-08** (AI4 engine checked; the 📎 button in the browser not yet — dev server wedged) — next is AI5 (Shop Rules page)
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

**Never:** delete walls or CAD, touch the cabinet library, touch other jobs.
Cabinets may be deleted only through Apply, with a full Undo (locked decision 7).

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
7. **The AI may delete cabinets — always with Apply** (Mark, 2026-11-08). Never
   straight away, even one cabinet in Selection scope. Undo brings the cabinet back
   whole (row + custom parts / end panels / fillers + its CAD + fixture links). A
   cabinet carrying protected CAD stops the delete and says so, as the canvas does
   ("Never delete user CAD" trigger). Supersedes the "Never: delete" line under Tools.
8. **Several changes in one message** (delete + move others into its place) apply as
   one batch with one Undo — needed for 7 and for placing runs.
6. **Streamlined design** — compact summary, bulk-by-filter tools, server expands and
   applies, model routing, drawing via one room plan. Target $20–40/month, $50 cap.

## Phases

| # | Phase | Done when |
|---|---|---|
| AI0 ✅ | **Server actions**: placement / update / resolve callable server-side (from what `window.__canvasApi` does in the browser today); compact summary builder; batch + undo tables | A script can update 12 cabinets by filter server-side and undo it, matching what the UI produces |
| AI1 ✅ | Chat panel + Room scope, **read-only** Q&A on Haiku; cost log | "Total kick length in the Kitchen?" / "Which cabinets are TBC?" correct in a few seconds, cost logged |
| AI2 ✅ | Selection scope edits, `ask_user`, auto-apply small / approve big, Undo, history | Edit 3 selected cabinets from chat; Undo restores them exactly |
| AI3 ✅ | **Add / delete / multi-step**: place cabinets, end panels and fillers server-side (same path as the canvas: next label, cascade sizes, custom parts, neighbours); delete with Apply + full Undo (decision 7); several changes as one batch (decision 8); apply speed | "Delete BC-04 and slide BC-05 / BC-06 left into its place" and "add an end panel on the left of BC-03" — previewed, applied, undone exactly |
| AI3b ✅ | Door / board colours, Job scope, Sonnet routing, "Try harder" | "All overhead doors to Walnut" across a job, previewed and applied in ≤ 3 round trips |
| AI4 ✅ | Drawing via `apply_room_plan` from PDF / sketch on Opus | A room drawn from a plan matches what the draw-plan skill produces |
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

## AI0 — what was built (2026-11-08)

- **`src/lib/supabase.ts`** — the shared client is now a proxy: in the browser it is
  the browser client as before; on the server, code run inside `withSupabase()` uses
  that request's client. So the resolver / save code runs unchanged as the signed-in
  user. No browser-only dependencies were found in the resolve path.
- **`src/lib/ai/server/scope.ts`** — `withSupabase(client, fn)`. Runs one at a time
  and clears the resolver's module caches before and after, so a server run never
  uses another request's (or a stale) cached input.
- **`src/lib/ai/roomSummary.ts`** — compact summary (walls / cabinets / fixtures).
  Fronts, colours, handles and carcass board come from the saved parts. Test Kitchen
  (5 cabinets) = ~830 chars ≈ 210 tokens → a 40-cabinet kitchen ≈ 1.5–2K tokens.
- **`src/lib/ai/cabinetFilter.ts`** — filter (labels / codes / classes / walls /
  numeric where) + AI0 change whitelist (dx, dy, dz, pos_z, offset, notes), pure and
  unit-tested. Class "wall" takes wall corners; joined kicks only when named; an
  empty filter matches nothing; offset slides along the wall keeping the distance off it.
- **`src/lib/ai/server/cabinetBatch.ts`** — `previewCabinetUpdate`, `updateCabinets`,
  `undoBatch`. Same follow-ups as a canvas edit: full resolve + persist (awaited),
  face neighbours re-detected, under panels re-cut when a rangehood moves, warning
  when a joined-kick member moves (the canvas doesn't re-fit those either). Undo
  skips any cabinet edited again since, and reports it.
- **`ai_batches`** table (`migration_ai_batches.sql`, applied) — before / after per
  field per cabinet, `undone_at`, job-access RLS.
- **Check:** `src/lib/ai/__tests__/headlessAi0.test.ts` (gated by `AI0_RUN`) on
  Test Kitchen: both overheads dy 700 → 900 and back; WC-02 moved 600 → 1000 along
  Wall 1 (neighbours of WC-01 / WC-02 re-detected) and back — rows restored exactly,
  parts re-resolved, no resolver errors.

## AI1 — what was built (2026-11-08)

- **Panel** `app/canvas/[roomId]/AiChatPanel.tsx` — "✨ Ask AI" in the canvas toolbar
  (PC only), docked right. Shows the job's thread (last 60 messages; other rooms'
  questions tagged with their room), suggestion buttons when empty, cost + time under
  each answer. Tutorial lesson `ai_chat`.
- **Route** `app/api/ai/chat/route.ts` — POST `{ roomId, message }`. Signed-in user
  only; the room is read with their session (RLS), then the turn runs in
  `withSupabaseRead()` (reads only, not queued). 503 with a plain message if
  `ANTHROPIC_API_KEY` isn't set on the server. `maxDuration` 60.
- **Engine** `src/lib/ai/server/chat.ts` — Claude Haiku 5.5, effort low, frozen
  system prompt (prompt-cached), room summary in the new question only, last 6
  exchanges replayed as plain text (no tool calls / thinking — keeps the prefix
  stable), ≤ 6 API calls per turn.
- **Read tools** `src/lib/ai/readTools.ts` — `get_kicks` (saved toekick parts, totals
  per part, spreaders left out), `get_markup` (text + clouds with the cabinets each is
  on / within 300 mm of, plan and elevation), `get_cabinet_detail` (fronts, carcass
  parts, custom parts, fixtures).
- **`ai_messages`** table (`migration_ai_chat.sql`, applied) — the job thread + cost
  log: model, tokens (uncached / cache read / cache write / output), API calls, $ , ms.
  Monthly total = `sum(cost_usd)`.
- **Check** (`headlessAi1.test.ts`, gated by `AI1_RUN`, and in the browser) on Test
  Kitchen › Void Corner Demo: kick length 2143 (matches the saved kick faces), TBC =
  the one cloud near BC-07, plus the GPO note correctly called a note not a TBC.
  **4–7 s and 0.04–0.08¢ per answer.** Summary of a real 32-cabinet kitchen (RHK6595)
  ≈ 1,050 tokens.

## AI2 — what was built (2026-11-08)

- **Scope follows the canvas.** Cabinets selected → **Selection** (chip "Selection:
  WC-01, …"): the server refuses changes outside it. Nothing selected → **Room**:
  any change becomes a proposal that waits for **Apply** (pulled forward from AI3 —
  it's the same approval flow, and safer than refusing).
- **`update_cabinets`** tool (`src/lib/ai/server/chat.ts`): filter optional in
  Selection scope (= the selection). Change whitelist now also has **scribes**
  (left / right / top / bottom / back → `rule_overrides` SCRL / SCRR / SCRT / SCRBT /
  SCRBK, null = inherit) and **handle schedule** (by name → `hardware_overrides
  .handle_schedule_id`, null = inherit; `list_handle_schedules` tool). One edit per
  message. Selection ≤ 3 cabinets (`AUTO_APPLY_MAX`) applies straight away; else a
  proposal. Change lines read per key ("SCRR inherited → 20").
- **`ask_user`** tool — question + 2–4 option buttons; ends the turn; buttons live
  on the latest message only; a click sends the option as the next message.
- **Apply / Cancel** `app/api/ai/apply` (re-expands the proposal against the room
  as it is now), **Undo** `app/api/ai/undo`. Both run in `withSupabase()` as the user.
- **`ai_messages`** gained `question`, `proposal`, `proposal_status`, `batch_id`,
  `changed`, `undone_at` (`migration_ai_chat_edits.sql`, applied). History replays
  those as text ("[Applied: …]", "[Undone by the user]").
- **History is per room now** (the panel still shows the job's thread): replaying
  other rooms' messages muddled labels (Haiku mixed BC- labels from another room).
- **Canvas** reloads the changed cabinets after an apply / undo
  (`reloadCabinetsFromServer`: drops resolver caches, takes the saved rows, re-resolves).
- Fixed: Undo's "changed since" check and the change lines compare jsonb with sorted
  keys (Postgres reorders jsonb keys).
- **Check (browser, Test Kitchen):** select WC-01 → "make this 900 high" → applied
  (dy 700 → 900, canvas updated, 16 s incl. resolve) → Undo → 700. Nothing selected →
  "make all the overheads 800 high" → proposal WC-01 / WC-02 700 → 800 → Cancel →
  unchanged. "add a scribe to this" → question with side / mm buttons. 0.02–0.07¢ each.
- Tutorial `ai_chat_edit`.

## AI3 — what was built (2026-11-08)

- **Batch engine rewrite** `src/lib/ai/server/cabinetBatch.ts`: a change is ordered
  **steps** — `update` (filter + changes), `place` (library code on a wall at an
  offset, or `next_to` a cabinet's left / right as you face its front), `delete`
  (labels). `planBatch()` runs them on an in-memory copy of the room (so later steps
  see earlier ones, and new cabinets get the labels they'll really get); the lines
  the user approves are exactly what `runBatch()` then does. One `ai_batches` row,
  one Undo.
- **Place** = the canvas's path server-side: `buildInstanceFromDefinition` with the
  room / job / shop class sizes (`resolveClassDims`), `nextLabel`, wall anchor (or
  the neighbour's own distance off the wall for `next_to`), back-face cabinets
  flipped, bulkhead auto height, floating shelf height, then
  `dbInsertDefinitionParts` (the definition's end panels / fillers). Kits and angled
  corner fillers are refused (place by hand). Overlap on the same wall + height band
  is a ⚠ warning, not a block. Like the canvas, a new cabinet takes the next free
  label, which can be a just-deleted one's.
- **Delete** keeps a full copy for Undo: the row (same id comes back) + custom parts,
  part shape overrides, joint instances + their operations, fixture links. Refused:
  cabinets in a joined kick run, and cabinets with CAD on their cabinet sheet (the
  "Protected CAD" trigger isn't live, so the guard is in code). An under panel's
  scribe comes off the carcasses over it, as on the canvas. Parts, fronts, hinges
  are rebuilt by the resolve.
- **Undo** runs last step first: updates back (unless edited since), added cabinets
  removed (unless CAD was drawn on them since), deleted ones restored.
- **Settle** after any batch / undo: neighbours re-detected room-wide (canvas rule),
  everything touched resolved **4 at a time** (was one by one), under panels re-cut.
- **Chat**: `change_cabinets` (steps) replaces `update_cabinets`; `find_library`
  read tool (code / class / default size / category). Auto-apply only for
  update-only Selection changes on ≤ 3 cabinets; any add / delete waits for Apply
  (decision 7). AI2 proposals still apply. Canvas reload adds new / drops deleted rows.
- **Check:** engine (`headlessAi3.test.ts`, gated by `AI3_RUN`) and in the browser
  on Test Kitchen — "delete WC-02, slide WC-01 right so its right end sits where
  WC-02 ended, and put an end panel on the left of WC-01" → Delete WC-02 / WC-01
  offset 0 → 900 / Add WEP @ 882 → Apply (canvas showed it) → Undo → every row back
  exactly, WC-02 same id. 0.10¢; apply 8.5 s, undo 3.3 s for 3 steps.
- Tutorial `ai_chat_add_delete`.
- **After Mark's first tries (2026-11-08):** island back. The summary now marks
  back-face cabinets ("Island 1 back @ …") with a note that on the back your left is
  the high-offset end; `place` takes `back: true` and `at_end: left | right` (as you
  face that side — the server works out the offset, so the model never has to flip
  it). Anything placed `next_to` a cabinet of the same kind takes that cabinet's
  height and height off the floor (an end panel beside a 600 overhead is 600, not the
  library's 700) unless a height is asked for. Checked plan-only
  (`headlessPlan.test.ts`, reads only) on Kitchen - Paul: BEPF at the island back's
  left end → opposite side of the island line, facing out, @ 2862 of 2880.

## AI3b — what was built (2026-11-08)

- **Colours, two ways** (`cabinetFilter.ts` + `cabinetBatch.ts`):
  - **Room / job, by kind** — `set_material` step: writes the same rows as the
    Materials tab (`room_materials` / `job_materials`: base / wall / tall ×
    door_face / interior / exposed / shelf / divider; `room_ / job_toekick_materials`
    part_role face for the kick). null = back to inherited. Always waits for Apply.
    Lines: "Room Kitchen · overheads fronts: inherited → LX Colour 16mm – Natural
    Walnut (2 cabinets)". ⚠ lines name cabinets that keep their own colour, and (job
    level) rooms with their own room colour.
  - **One cabinet's own** — `update` changes `materials { fronts | carcass | exposed |
    shelf | divider | kick }` → `material_overrides` (door_face / interior / …) or
    `toekick_overrides.face`; the resolver already ranks these over room / job.
- Writing a colour row drops the resolver caches first, so the resolves after it read
  the new colour (found when an Undo in the same run re-resolved with the old cascade).
- Undo restores the row (or removes it) and re-resolves every cabinet it reached;
  skips it if the row was changed again since.
- **Job scope** (for colours): a job colour reaches every room; the cabinets in other
  rooms re-resolve too (`settle(..., elsewhere)`); the canvas only reloads its own
  room's rows. Job-wide *sizes / adds / deletes* stay room by room for now.
- **Boards by name**: `find_material` tool + `findMaterial()` (exact, else the one
  partial match, else "say which" with the candidates — the model turns that into
  ask_user buttons, e.g. Natural Walnut 16 mm vs 33 mm).
- **Try harder**: ↻ under the latest answer re-asks the same question on Claude
  Sonnet 5.5 (effort medium); priced per model in the cost log; tagged "tried harder".
  Not offered once an answer has changed something.
- **Check** on Test Kitchen: engine (`headlessAi3.test.ts`) overheads White → Natural
  Walnut + TC-01's own Black Matt → saved fronts changed → Undo → White / Boston Oak,
  colour rows and cabinet rows exactly restored. Browser: "make the overhead doors
  natural walnut" → asked 16 mm or 33 mm; with the 16 mm named → proposal → Apply →
  Undo. Try harder: 0.02¢ Haiku vs 1.4¢ Sonnet. Plan-only: job bases fronts → 8
  cabinets across both rooms; room kick face → 2.
- `headlessAi3.test.ts` reports resolver errors instead of failing on them (Test
  Kitchen's TC-01 has a hinge / shelf-hole clash of its own), and has an undo-only
  mode to clean up a run that stopped early.
- Tutorial `ai_chat_colours`.

## AI4 — what was built (2026-11-08)

- **📎 Draw from plan** in the Ask AI panel: the PDF / photo (≤ 20 MB) goes from the
  browser straight to the private `ai-uploads` bucket under `<project_id>/…`
  (`migration_ai_uploads.sql`, applied — only people who can open the job can
  upload / read / remove), then `POST /api/ai/draw` (`maxDuration` 300) reads it.
  Notes typed in the box first go with it ("page 2 is the laundry").
- **Engine** `src/lib/ai/server/draw.ts`: Claude Opus 5.5, effort high, streamed; the
  file is sent once and prompt-cached across the tool loop; tools = `find_library` +
  `room_plan` (walls, items {wall, back, code, offset, dx, dy, dz, note}, tbc,
  summary). The plan → `wall` + `place` steps → `planBatch` dry run; problems go back
  to the model (2 fixes max); anything still failing is listed "✗ … (left out)" and
  dropped. Result = one proposal → Apply (existing route) → one Undo removes it all.
  Uses the room's existing walls by name; never touches what's there.
- **Rules** `src/lib/ai/drawRules.ts` — the draw-plan / cabinet-codes skills
  condensed for a JSON-only planner (coordinates, clockwise walls, island face =
  left-perp, dims, appliances as gaps, fillers / panels / corners, codes, TBC list).
  Keep it in step with those skills.
- **`wall` step** in the batch engine: inserts walls named / sized as the canvas does
  (Wall N / Island N, islands thickness 0, others the room's wall defaults); later
  steps can place on them; Undo removes a wall only if nothing is on it. `place`
  takes `dz` too.
- **Check** (`headlessAi4.test.ts`, gated `AI4_RUN`) — `RHK1234 - John Smith - Test
  Kitchen2.pdf` (4 pages) into a new empty room **RHK1234 › AI4 Draw Test**: read in
  47 s for $0.145, applied. Against the hand-drawn **Kitchen Test Room**: both walls
  identical (lengths, angles, start points); BC-02 / BC-05 / TC-01 identical; WC-01 /
  02 same places (300 deep vs 350); BC-01 B1D vs B2D (it flagged the hinge as TBC);
  BC-03 / 04 D2-LL vs D2-SL; base depth 575 vs 580. Its TBC list: the empty corner,
  the 16.5 gap by the tall, end panels on the exposed ends, overhead ceiling
  treatment, hinge side. Room **AI4 Draw Test 2** (empty) was made for the browser check.
- Not yet: TBC clouds / notes aren't drawn as CAD markup (they're listed in the
  message); fixtures / appliances aren't placed (gaps only).
- Tutorial `ai_draw`.

### AI4 open questions (Mark) — the skills disagree here; drawRules.ts picks the first
1. Wall-run fillers: on-kick BFK / TFK default, vs "always ask 30 vs material
   thickness" (CV conventions / intake checklist). Picked: ask (TBC) unless the plan shows it.
2. Island face: left-perp of draw direction (current) vs "toward the room centroid"
   (old schema note). Picked: left-perp.
3. Nib walls: no rules anywhere — the AI doesn't draw nibs (TBC instead).
4. Blind corners: cabinet-codes lists BCNR / WCNR, the skill builds one from B1D +
   false panel. Picked: closest library code + TBC.
5. Kick 140 vs 100: no room kick field in the plan JSON; base dy carries it.
6. Overhead top line when the plan is silent: 2100 vs the 2400 line vs ceiling drop
   30 + 30 BH. Picked: 2100 + TBC on ceiling treatment.
7. Dishwasher gap 605 (freestanding) vs the 610 example; D/W at a wall uses BFF
   (contradicts "fillers on the kick").
8. Filler / panel depth: easy to double-count the door — panels get the carcass dz.
9. Legacy codes (B2, D2, Wall Unit, P2-3ID) still in the checklist — mapped to new codes.
10. Tall height: 2100 default vs "ask rather than guess". Picked: TBC when not stated.

## Open items (check while building)

- Job-wide sizes / adds / deletes (several rooms in one change) — colours only so far.
- AI4: draw TBC clouds / site notes as CAD markup (Questions for Client layer), and
  appliance fixtures from the catalogue.
- **Apply speed:** resolves now run 4 at a time; a 3-step batch applies in ~8.5 s.
  The first resolve in a request is still slow (cold caches).
- Other people with the same room open don't see an AI change until they reload.

- **Production key:** `ANTHROPIC_API_KEY` is set in Vercel (Mark, 2026-11-08) and in
  `.env.local` for dev. Spend cap US$50 in the Anthropic Console.
- Corners: the summary's class column says `base_corner` etc., but "the corner
  cabinet" is ambiguous when the corner is a plain code — Haiku asks which label.

- **Speed:** ~3–4 s per cabinet resolve on the server with cold caches, one after
  another (2 cabinets ≈ 8 s). A 12-cabinet job-wide change would be ~40 s — resolve
  in parallel / keep the cascade cache within a batch before AI3.
- How open canvases learn about changes (existing realtime channel vs refresh) — AI1/AI2.
- Material / handle / scribe changes in `update_cabinets` — need the override
  structures (door colour per class lives on the job / room; per-cabinet in
  `material_overrides`) — AI2/AI3.
- Haiku's reliability on edits — measure in AI2 before committing to it.
