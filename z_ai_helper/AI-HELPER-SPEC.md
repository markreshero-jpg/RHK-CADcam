# AI Helper — In-App Chat That Changes Jobs

Status: **AI0 – AI5 + follow-ups built and checked 2026-11-08**; **Q1–Q7 quality pass 2026-11-27** (chat on Opus 5.5 high, no fake fixes, explains every change; re-resolve, hinges, interior, back board) — remaining open items at the end
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
3. ~~**Chat history per job** — one thread~~ → **superseded 2026-11-08:** several chats
   (conversations) per job, see "Chats, voice, Attach plan" below. Each message still records its scope.
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
| AI5 ✅ | Shop Rules editor in Settings, per-job notes, admin cost view | Rules editable and visibly followed; monthly total shown |

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
  treatment, hinge side. **Browser check** (after a clean dev restart — the old `.next`
  had lost every `/api/*` route): 📎 on the empty room **AI4 Draw Test 2** → same plan
  in 52 s for 16¢ (consistent with the direct run; its TBC list also caught the
  exposed overhead end and the missing return wall) → Cancel; the room stays empty.
- Not yet: TBC clouds / notes aren't drawn as CAD markup (they're listed in the
  message); fixtures / appliances aren't placed (gaps only).
- Tutorial `ai_draw`.

### AI4 drawing decisions (LOCKED, Mark 2026-11-08)
Where the skills disagreed. In `src/lib/ai/drawRules.ts` and the draw-plan /
cabinet-codes skills.
1. **Set-up first, ask — don't assume.** If the job / room doesn't have the kick
   height (TOEH), tall height or overhead top line set, the AI asks (one round, up to
   4 questions with buttons, the plan's reading offered first) and saves the answers
   to Job / Room properties as part of the Apply. Saved to the **job** while it's the
   job's first room with cabinets (later rooms inherit it), else the **room** — so a
   drawing never changes other rooms.
2. **Overheads sit at the soffit line** (room soffit drop or overhead top line).
3. **Wall-run filler not shown → leave tight + TBC** ("30 or board thickness?").
4. **Dishwasher type not shown → ask.** Freestanding 605 + BEPF each side;
   integrated 600. **D/W against a wall: BEPF on the D/W side only** (no BFF).
5. **No blind-corner code** (no BCNR in the library). 900 × 900 corner → BCNP;
   900 × 600 → B1D with door + false panel, blind side to the corner (TBC to set the
   fronts). A saved "blind corner" library cabinet is wanted later.
6. **Island back panel not shown → ask** (back panel? IBPF or IBPK?).
7. Island face = left-perp of the draw direction (already locked); nib walls aren't
   drawn (TBC); panels take the carcass dz (the definition adds the door); legacy codes
   map to new ones.

**Built (2026-11-08):** `set_properties` batch step (kick → `rule_overrides.TOEH`;
base / tall / overhead heights → `class_dimension_defaults`; room soffit drop /
overhead top line), full Undo. Draw engine tells the model what's set / NOT SET and
where new values go; `ask_questions` tool ends the turn; the question message keeps
the plan (`ai_messages.draw`, `migration_ai_draw_ctx.sql`); answers (buttons + Send
answers, or typed) carry the drawing on via `POST /api/ai/draw { continueFrom, answer }`.
**Checked:** AI4 Draw Test 2 (RHK1234 has other rooms with cabinets) → asked kick
(140 plan / 150 / 100) + overhead tops (300 down / 2100 up) → drew it, saving kick
140 + top line 2100 to the ROOM (job untouched) → applied; ~30¢ for both rounds; it
also flagged "elevations show 880 bases, job set-up says 900". Browser: the question
groups + Send answers render; on AI4 Draw Test it saw all 8 items already there and
said it won't add duplicates (2.3¢ — plan cached).

## AI5 — what was built (2026-11-08)

- **Shop rules** = `shop_settings.ai_rules` (`migration_ai_rules.sql`, applied; seeded
  from the conventions in Claude Code's memory). Edited in **Settings › AI helper**
  (`app/settings/AiHelperSettings.tsx`; Settings is admin-only, and shop_settings is
  admin write / everyone read). Token estimate under the box (amber over 1,500).
- **Job notes** = `projects.ai_notes`, **Job Properties → "Notes for the AI"**.
- Both engines (chat + drawing) load them per request (`src/lib/ai/shopRules.ts`):
  rules as a second cached system block after the fixed instructions (cost ~nothing
  until edited), job notes in the user turn (`<job_notes>`), and the model is told job
  notes win for that job. The hard-coded "Shop conventions" lines left the chat prompt.
- **AI cost** on the same tab: the month's total against the $50 cap (bar), answers,
  by job / person (`admin_list_users`) / model (Haiku everyday, Sonnet Try harder,
  Opus drawing); ‹ › for earlier months.
- **Check (browser):** Settings › AI helper showed 66.6¢ / 44 answers for November
  2026 with the three breakdowns. With a temporary job note on Test Kitchen ("call
  overheads top cupboards"), "Should WC-01 get a finger pull?" → "No. Shop rule is no
  finger pulls on top cupboards…" — both the rule and the note reached it. Note removed.
- Tutorial `ai_rules`.

## Chat moved to Sonnet + overheads / bulkheads (2026-11-08)

- **Why:** on RHK6586 Greystone › Kitchenette Mark asked "WC-10, 04, 01, 02, 03 170 higher
  toward the ceiling, bulkhead 30". Haiku set their pos_z 0 → 170 (overheads hang from
  the top line, so nothing moved — and that change is still there), then grew them
  downward, set a height-to-ceiling bulkhead's dy (the canvas re-fits it straight
  back), and told him to "press Apply" for things already applied.
- **Decision (Mark):** chat runs on **Claude Sonnet 5.5** (effort medium); **Try harder
  = Opus 5.5** (effort high); drawing stays Opus. Haiku is no longer used. ~1–2¢ per
  message.
- **Overheads:** `pos_z` on a hanging overhead is refused with how to do it; new
  `changes.wallz` (rule WALLZ — one overhead's own underside, null = hang again); chat
  step `set_properties` (room / job: overhead top line, soffit drop, kick, class
  heights; job-level changes wait for Apply like everything room-wide).
- **Bulkheads on height-to-ceiling:** setting their dy is refused (raise the top line
  instead); a room top-line / soffit change re-fits them in the same batch (as the
  canvas effect does), shown as "(bulkhead re-fits to the ceiling)".
- **Summary** now starts with ceiling + overhead top line, and the column is the real
  underside off the floor (`cabBottomZ`), marked "(bulkhead, fills to ceiling)" /
  "(own underside)" — no more stale pos_z.
- **Reporting rules** in the prompt: describe changes only from the tool result;
  waiting-for-Apply ≠ done.
- **Check** (`headlessScenario.test.ts`, gated `SCENARIO_RUN`) on Test Kitchen › **AI
  Overhead Test** (a copy of the Kitchenette set-up: ceiling 2320, top line 2120, 620
  overheads, BH): Mark's request → "top line 2120 → 2290, BH 200 → 30, WC-01 / 02 620 →
  790" (undersides stay 1500) — right first time, 1.8¢ / 3.6 s; Undo exact. "move this
  cupboard up 100" (WC-01 selected) → WALLZ 1600, applied, warned it runs 100 into the
  bulkhead; Undo exact.

## Follow-ups built 2026-11-08 (Mark: "yes" to all)

- **Greystone fixed as Mark asked:** RHK6586 Kitchenette — Haiku's stray pos_z undone;
  **Wall 2** own soffit 30 (top line 2120 → 2290), WC-10 / 04 / 01 / 02 / 03 620 → 790
  (undersides stay 1500), BH WC-08 re-fits 200 → 30; Wall 1 / pantry untouched. Posted to
  its Ask AI chat with Undo. New `set_properties` `wall` + `wall_soffit_drop` (one wall's
  soffit; its overheads / bulkheads follow).
- **Blind corner** `BCNR/L`, `BCNR/R` (z_cabinet_library/migration_bcnr_library.sql) —
  Mark's build: one carcass, door + false panel, blind width = return depth + its door +
  2 + 40 (620), 40 filler on the return run, inside per job. `place` `blind_width` sets the
  false panel column (the AI works it out).
- **Markup** step: notes on an elevation per MARKUP-STANDARD — layers General /
  Questions for Client (created teal #0891b2 when a job lacks it) / Site notes /
  Electrical; TBC → cloud, appliance space → dashed box (others just a leader); text
  inside an empty space or stacked in the right margin. Drawing adds markup for every
  room; chat on request. Undo removes only the AI's own notes nobody has edited.
- **Fixtures** step: catalogue items (`find_fixture`) on a cabinet — centred, linked via
  `cabinetPlans` / `linkedPose` so the benchtop cut-out follows (sink, cooktop, oven,
  rangehood) — or in a wall gap (dishwasher, fridge, washer; floor, unlinked). Full
  catalogue body copied. Drawing places them; chat on request.
- **Whole job:** steps take `rooms` (names or ["all"]); one proposal across rooms →
  `runJobBatch` (a batch per room under a parent) → one Undo. `get_job_summary`,
  `get_room_summary` read the other rooms.
- **Live refresh:** `ai_batches` in the Realtime publication; each canvas listens for its
  room's new / undone batches and reloads those cabinets (others get a reload hint for
  walls / fixtures / notes / set-up). The socket must `realtime.setAuth()` before joining
  or RLS filters every event (found in testing).
- **Phone:** ✨ in the phone toolbar; the chat opens full screen.
- **Checks** (Test Kitchen job): blind corner BCNR/L blind 620 via chat; TBC cloud + site
  note drawn (elevation screenshot) and undone; Zalo sink centred + linked on a BSK and a
  dishwasher in its gap (plan screenshot) and undone; every base on the job → 570 (9
  cabinets, 3 rooms) and back; an open canvas saw WC-02 620 → 700 → 620 live; phone panel
  at 390 × 844 answered.
- Tutorial `ai_more`.

## Chats, voice, Attach plan (2026-11-08, Mark: "can you do it all")

- **Conversations:** `ai_conversations` (z_ai_helper/migration_ai_conversations.sql; job
  access RLS) + `ai_messages.conversation_id`. Old messages became one "Earlier chat" per
  job. Only the chat's own history goes back to the model; a message from another room
  is tagged `[In room X]`. A new chat names itself from its first question (📎 → "Plan:"),
  ✎ renames. Server: `ensureConversation` / `touchConversation`
  (src/lib/ai/server/conversations.ts); chat and draw routes take `conversationId`
  (a drawing's answers follow the question's chat).
- **Panel:** chat name at the top (☰ ▾) opens the list: Search (chat names + message
  words across the job → jump to the message, lit up), ＋ New chat, newest first. Opens
  on the job's latest chat. A new chat is saved on its first message.
- **Two at once:** busy / error per chat; while one thinks you can open another and ask
  there. An orange dot shows another chat still working. Checked: two concurrent
  chats on Test Kitchen kept their own memory (headlessAi1 `chats`), and in the browser.
- **🎤 Voice to text:** the browser's speech recognition (en-AU), words go into the box
  for you to check, then Send. Hidden where the browser has none. Needs a real-device
  check (headless Chrome has no microphone).
- **Attach plan:** paperclip icon + "Attach plan" (PC); full-width "Attach plan or photo
  — draw this room" on the phone.
- No delete for chats yet (Undo links live on the messages). Tutorial `ai_chats`.

## Quality pass Q1–Q3 (2026-11-27, Mark: "it's not as good as you in the terminal")

Found in the real chats: requests with no tool behind them were faked or dropped —
"take 120 off, keep the gap at the top shelf" changed the height and *rewrote the note*
("shelf 420 down" → "300 down"); "re-resolve, only four hinges" just added "Hinges: 4" to
the notes; most proposals said only "Here's what will change — press Apply"; handle
changes showed raw ids. November total was US$1.54 for 83 questions, so cost wasn't the limit.

- **Q1 No fake fixes.** Prompt: do the real change or say plainly it can't; never write a
  request into notes; do the parts it can, then list what it did NOT do (shelf / divider
  positions, hinge counts, one part's board, kick pieces, re-resolve, walls, benchtops).
  Server: an update step with `notes` is refused unless the user's own words say note /
  notes / noted.
- **Q2 Explains every change.** A proposal no longer ends the turn: the model gets the
  change lines back ("NOT done yet… check these against what was asked"), may call
  `change_cabinets` again to replace a wrong proposal (an applied change can't be
  replaced), then answers in 1–3 lines incl. what it couldn't do. Out of steps → one last
  no-tools call for a real answer. Sizes in a change are the new value, never a delta
  (caught live: "50 deeper" sent dz 50, now 400). Handle lines show schedule names.
- **Q3 Model.** Everyday chat Opus 5.5 at effort high (was Sonnet medium); Try harder =
  Opus xhigh, logged as `claude-opus-5-5 xhigh` (the panel's "tried harder" tag and the
  cost view key on that); 12 calls a turn, 16K tokens. ~2–6¢ a question.
- Checked headless on Test Kitchen: hinges + re-resolve → plain "can't, do it on the
  canvas", nothing changed; "overheads 50 deeper + top shelf up 100" → 350 → 400 proposal,
  shelf flagged not done, bulkhead depth asked; push-to-open + a note applied with names,
  undone.
- **Q4 new steps (Mark: "lets go item 4"):**
  - `resolve` (labels) — re-resolve as they are; a `resolve` batch entry, nothing to undo.
  - `hinges` (labels, `per_door` n | null, optional `door` row,col) — writes the door's
    face_grid `zone.hinges` (manual, as the Front editor does), spaced like resolveHinges
    with the shop rule's insets for that door height; null = back to the shop rules.
    Shaped (faces) cabinets refused.
  - `interior` (label + moves) — `src/lib/ai/interior.ts`, the Interior editor's tree moves
    on numbered bays ("2.1"; bottom → top / left → right): size, adj_shelves, add_shelf
    (below = height under it), shelf_type, remove_shelf (contents kept), add_divider,
    remove_bay. Drawers / rails / accessories inside a bay are not editable yet.
  - Colour role `back` → material_overrides.back (the resolver's back-panel role; else
    the carcass board), cabinet / room / job.
  - get_cabinet_detail shows hinges per door (count, positions, manual / shop rules), the
    interior as numbered bays, and the resolved shelf heights.
  - Resolver errors in a result must be told to the user; a question drops a half-made
    proposal from the same message (ask first).
  - Checked headless on Test Kitchen TC-01 (all undone): 2 hinges per door → 100 / 2050,
    warned light for 2150 doors, Undo restored the manual 255 / 730 / 1264 / 1846;
    "drop the fixed shelf 100, 2 adjustable above" → fixed 916.5 → 816.5, 3 → 2 adj (the
    resolver then flagged the inner drawers overflowing the smaller bay — Q5 would catch
    it); back Satin Board 18mm (back part 18 thick) + re-resolve WC-02. Unit tests
    `interior.test.ts`. TC-01's hinge-plate / shelf-hole clash at 1996 is pre-existing.
  - Not done: single kick pieces (geometry, needs its own design); tutorial owed
    (lessons.ts has another session's edits in the tree).
- **Q5 check after Apply (Mark: "start item 5"):** `src/lib/ai/server/check.ts` —
  after `/api/ai/apply` succeeds, one Opus call (effort medium, structured JSON: ok /
  text / fixes) gets the request, the applied lines, the resolver errors / warnings and
  get_cabinet_detail for up to 4 changed cabinets + the room summary, and posts a chat
  message "✓ Checked: …" or "⚠ …" with fix buttons (question options; a button sends its
  words as the next message, so the normal turn makes the fix; "Leave it as is" last). A
  failed check never fails the Apply; the panel's raw warning bar is skipped when a check
  came back. Auto-applied selection changes get the cabinets' resolved detail in the tool
  result instead, inside the same turn. ~2–3¢ a check.
  - Checked headless (scenario `check: true`, all undone): shelf drop on TC-01 → "⚠ …
    inner drawers overflow … " + buttons "make bay 1 750 high again / take one inner
    drawer out / Leave it as is" (2.6¢); back Satin 18 → "✓ Checked: back 847×2117×18 …"
    and named the old hinge / shelf-hole clash as not caused by it (1.9¢).
- **Q6 shop rules (Mark approved all 10, 2026-11-27):** appended to shop_settings.ai_rules
  (Settings › AI helper, now 2,229 chars) from the Claude Code memory conventions: end panel
  back edge untaped on a wall; 18 Satin Board no tape; tall fillers on the kick (TFK/TFKW);
  "bulkheads" = BH at a 30 soffit, auto height + 10 past the ceiling; BH takes the overheads'
  finish; wall-hung open boxes = WOPN, back scribe 0; hanging rails unlocked (centre-pillar
  drop); native features, never hide / stretch parts; generic appliance notes; ask before a
  floating base gets back scribe 0. Checked: asked about a filler at TC-01 and bulkheads over
  WC-01/02 → TFKW on the kick, BH at a 30 soffit + 10, bulkhead in the overhead colour, and it
  flagged WC-01's back scribe 18 against the overheads-0 rule.
- **Q7 "Can't do yet" list (Mark: "start on seven"):** `ai_gaps`
  (z_ai_helper/migration_ai_gaps.sql, job-access RLS; request, missing, status open / built
  / ignored). The chat's `report_gap` tool logs each missing feature before it says it
  can't (missing = a short fixed-wording name so reports group). Settings › AI helper ›
  Can't do yet (app/settings/AiGapsList.tsx): grouped by missing, most asked first, ▸ shows
  every request with job + date, Built / Ignore close a group, Reopen. Backfilled from the
  real chats: kick pieces (RHK6586, open); part board (backs), hinge counts, shelf positions
  (built by Q4). Checked headless: "move the bottom inner drawer in TC-01 up 50" → logged
  "drawers inside a bay", told the user plainly. Settings page not yet seen in the browser.
- **Tutorial (2026-11-28):** lesson `ai_inside` — hinges / re-resolve, shelves and bays,
  back board, reading the check after Apply, the Can't do yet list.
- **Q8 drawers inside a bay (2026-11-28, from the Can't do yet list):** interior moves
  `add_drawer` (inner / rollout in its own auto-height bay, as the editor adds one; `below`
  = space under it, 0 = on the bay's bottom, left out = halfway; `height` = box height),
  `move_drawer` (`up` ± mm = the editor's gap drag: the bay under it grows, or a sized bay
  above shrinks, and a locked box bottom shifts with it; `bottom` = exact locked box bottom
  for small nudges / null = auto; `height`), `remove_drawer` (empty open bays joined with no
  shelf merge back). Locked `bottom` alone leaves the bays where they are — the resolver
  lays an auto-height bay out from its neighbours, not from the drawer's lock — so it can
  overflow; `up` is the default.
  - get_cabinet_detail shows each drawer: locked / auto box bottom, the auto one's box
    bottom as resolved (front y − the front offset read off a locked drawer), and the
    resolved front. Change lines list every drawer, and name nested bays that changed.
  - FITTING_OVERFLOW message now gives the box and compartment positions when the box is
    shorter than the bay but sits past its top (was "127mm exceeds 150mm").
  - Checked headless on Test Kitchen TC-01 (all undone): "bottom inner drawer up 50" →
    bay 1.1.1 2 → 52, front 170.5 → 220.5, no warning; "rollout at the bottom of bay 2" →
    sits on the fixed shelf; "rollout 300 up" → asked (clashes with the adj shelf); "take
    the middle drawer out" → removed, check flagged the locked 695 drawer now outside its
    bay and offered auto. Unit tests in interior.test.ts. ai_gaps "drawers inside a bay"
    marked built.
- **Kick pieces — design confirmed by Mark 2026-11-28 (not built yet):** tested from scratch
  in RHK6542 DHID › Living Room (Wall 1 + Wall 2 @ 45°, B2D B2D | BFKANG | B2D): Join kicks
  made a straight Wall-1-only KICK 1 (1751.7 face / sub / back, no bevels) and left the Wall 2
  cabinet on its own kick. Decided: Join kicks takes in the next wall's cabinets that butt
  through an angled filler; the face mitres at the filler's front corners (Greystone-style 45°
  bevels); the back mitres where the walls meet. **Built in the app 2026-11-28** as KA1
  (z_kick_join/KICK-JOIN-PLAN.md "Kick round an angled filler"); the AI step comes after Mark's
  in-app check.
- **Q9 reading CAD + site sketches (2026-11-28, Mark: "can we get the ai model to be able to
  read cad, even my site sketches"):** sketches are freehand strokes (handwriting, no text), so
  the model SEES them: `src/lib/ai/cadImage.ts` draws one view's CAD (plan, or a wall's
  elevation — every kind: freehand / bulged lines, rects, ellipses, circles, arcs, clouds,
  text, dims incl. special) as an SVG with a labelled mm grid and the walls faint behind;
  `server/cadPicture.ts` makes the PNG (sharp, loaded lazily) and lists typed text / dims as
  words (`cadText`).
  - Chat: `look_at_cad` read tool (view plan | elevation + wall) returns an image tool result
    (`runReadToolContent`); the room summary gets "CAD on this room's canvas: plan: 244 items
    (244 hand-sketched strokes)…" so the model knows to look; prompt says to say what it read
    and flag what it can't make out.
  - ✏️ **Draw from my sketch** (panel button beside Attach plan, phone too): `/api/ai/draw`
    `{ fromCad: true }` → DrawCtx.path `cad:` → runDrawTurn sends the plan + any elevations
    with CAD as pictures instead of an upload; the rest of AI4 (questions, room_plan, checks,
    Apply, one Undo) is unchanged.
  - Checked headless: RHK6596 Laundry "what does my sketch say?" → read 805 washer/dryer space,
    1970 bench BSK + B2D, 600 deep, 2 × W2D 300 deep, seen ends, CH 2430 (flagged vs the room's
    2400), cornice 90, the 3-room spec box (20 stone, 2pac, small lip pull black), Caroma tub
    re-used; listed the open widths (12 s, 9¢). Draw from my sketch on a copy of that sketch in
    RHK1234 › "AI Sketch Test": asked kick / top line / wall length / seen ends, then drew
    3 walls, BEPF + BSK 1000 + B2D 970, WEP + 2 × W2D 1000 / 970 × 300, washer in the 787 gap,
    TBC clouds; applied clean (2 calls, 28¢). Sketches aren't to scale, so the walls follow the
    written numbers and sit over one end of the sketch. Unit tests cadImage.test.ts; render
    check headlessCad.test.ts (CAD_RUN), AI4_RUN takes `"sketch": true`.
- **Next:** an AI step for joining kicks round an angled corner (after the KA1 in-app check).

## To build — Mark's running list (from his chats; add as he finds more)

Not started. Each also has an open `ai_gaps` row (the chat logs its own as it hits them).

| # | From | Ask | What the chat can't do | Notes |
|---|------|-----|------------------------|-------|
| T1 | RHK9999 BBQ, BC-10 | "space the hinges further apart, lower to the bottom and higher to the top" | **hinge positions** — only hinge count | 270 high doors got hinges at 100 / 170 (70 apart): the hinge rule's 100 top / bottom inset pushes them to the middle on a short door. Two fixes to decide: a per-door hinge position step, and/or the shop rule using a smaller inset on short doors. |
| T2 | RHK9999 BBQ, BC-01 | "re-hinge BC-01 so it is on the right" | **hinge side** — can't swap L/R | Single door sink cupboard, hinged left. |
| T3 | RHK9999 BBQ | asked about BC-01 while BC-10 was selected | **selection scope** — told Mark to select BC-01 first | When the user names a cabinet, work on it even if another is selected (selection = default, not a lock). |
| T4 | RHK6586 | "fix the kick join in the back corner on the angle" | **kick pieces** | App side done (KA1 + KA2, Mark checked 2026-11-28); needs the AI step (join kicks round an angled filler). |
| T3+ | RHK9999 BBQ | "delete shelf from BC-01" (BC-10 selected) | same as T3 | Hit again — Mark had to ask twice. The chat knew the fix and still refused. Top of the list. |
| T5 | RHK9999 BBQ | "change benchtop waterfall end on left to no waterfall end" | **edit a built benchtop** — waterfall ends | Benchtop 1 has mitred waterfalls both ends. |
| T6 | RHK9999 BBQ | "change the benchtop thickness" | **edit a built benchtop** — build method / thickness | Also the summary doesn't show a top's thickness or top-of-bench height when it's on the room / job default method, so the chat couldn't say how thick Benchtop 2 is. |
| T7 | RHK6596 Bathroom | "remove all clouds in cad" | **delete markup** | The chat also quoted the shop rule *never delete CAD someone else drew* (DB trigger). Decide: allow deleting markup when the user asks for it in their own words (undoable), or keep it canvas-only. |
| T8 | RHK6596 Bathroom | (the chat spotted it) top 110 above the 820 cabinets | **bug from R8** — the benchtops step built the Bathroom top at the 930 default underside, not on the 820 cabinets | Mark fixed it via the chat (room base height → 820). Fix: benchtops step sits a top on its cabinets' top when they're not the base height (set height_mm), and the summary flags a top floating above its cabinets as well as one cut into them. |

## Benchtop heights + cabinet-into-top clash (RHK9999 chat, 2026-11-28)

Mark asked if BC-10 (under the dropped Egg top) was into the stone; the chat couldn't see benchtop heights and asked
for a number twice. Now the room summary's Benchtops list gives each top's **underside** (height_mm, else the base
cabinet height room → job → shop, as the benchtop resolver) and the base cabinets **under** it (plan centre inside the
outline; each cabinet goes to the lowest top above its underside, so a dropped top claims the cabinet below it). A
cabinet whose top is above that underside gets a `CLASH — cabinet into a benchtop` line with the height that fits; the
chat fixes it with update dy (never moves the top) and the checker reports any clash left. Tested in RHK1234
(920 → 900, check ✓, undone). ai_gaps "benchtop heights" → built.

## RHK6596 chat review fixes (2026-11-28, Mark: "read the conversation inside RHK6596 … see
what the agent isn't capable of"; "fix in the order you suggest")
Order agreed: R1 under panel · R2 colour TBC · R3 ceiling from the sketch · R4 walls in chat ·
R5 copy cabinets to another room · R6 fixtures · R7 handle schedules · R8 benchtops · R9 spec
blocks (Mark: later).
- **R1 under panel (built):** the chat placed a WUP with `place` (pos_z 0 → on the floor behind
  the bases), then set its `wallz` — which under panels ignore (they sit at their own pos_z,
  `cabBottomZ`) — and twice told Mark it was right, explaining away the overlap warning and the
  check's ⚠. Now:
  - `under_panel` batch step {labels, set_back?, thickness?} = the canvas's Add under panel
    (`underPanelRun`): between the outer gables, underside at theirs (above any kick), thickness
    from their exposed board (resolver input), SCRBT of that on each carcass; set_back takes dz
    off. Refuses a second panel over the same span. `place` refuses BUP / WUP.
  - `update` refuses `wallz` on an under panel (use pos_z); pos_z already moves them.
  - get_cabinet_detail: "Height: underside N, top N from the floor (how it sits)" from
    cabBottomZ instead of the raw pos_z ("0 off the floor" misled on overheads).
  - Prompt: under_panel rules; overlap warnings / check ⚠ are real until a fresh detail says not.
    Check prompt: a bottom scribe lifts only the carcass, so a panel at the overhead underside is
    flush with the doors, not a clash.
  - Checked headless (RHK1234 AI Sketch Test, applied + undone): "add an under panel under the
    overheads, set back 20, scribe on the bottoms" → WC-04 WUP 1970×16.5×280 @ 805, underside
    1640 (= WC-02/03), SCRBT 16.5 on both. RHK6596 Laundry WC-04 fixed: pos_z 0 → 1353 (WALLZ
    cleared), as an AI batch (Undo-able).
- **R2 colour TBC (built):** a board with a colour range picked as itself ("Satin Board 18mm")
  resolves in its default colour (White) with COLOUR_NOT_CHOSEN — that IS colour TBC. The chat
  didn't know: it called it "not 2pac", then set the job to "– White" outright. Now the room
  summary lists "Colour TBC" (part · board · showing · labels) from each cabinet's resolve
  warnings (`colourTbc`); find_material marks such boards "board only = colour TBC (N colours;
  shows White…)"; chat + check prompts say keep the board on its own until a colour is named and
  copy specs room → room as-is. Checked headless: "all fronts 18mm 2pac, colour TBC" → Satin Board
  18mm + TBC cloud, check ✓ "colour TBC (showing White)". RHK6596 job fronts + exposed
  "– White" → "Satin Board 18mm" (batch 55700e51), matching the Laundry's.
- **R3 ceiling (built):** the sketch said CH 2430; Draw from my sketch gave the walls 2430 but
  left the room at 2400, and the chat had no way to set it. `set_properties` (room) takes
  `ceiling` (rooms.room_dy, 1500–6000; bulkheads on height-to-ceiling re-fit); room_plan
  setup.ceiling; draw set-up lists "Ceiling: N (room)" and says to use setup.ceiling rather than
  only wall heights; chat schema + description. RHK6596 Laundry ceiling 2400 → 2430 (batch 07640bce).
- **R4 walls in chat (built):** the chat said "I can't add walls" — the batch had a `wall` step
  (AI4) but the chat tool didn't offer it. Now `wall` {name?, x, y, length, angle, wall_type,
  wall_height?} in change_cabinets; the room summary's wall lines give "start → end" (plan mm,
  +y down) and own height so a new wall chains on; prompt: add only (moving / resizing /
  deleting walls is still hand work), clockwise, Wall N names. Checked headless (AI Sketch
  Test): "900 wall from the end of Wall 2, turning left" → Wall 4 900 @ 180° from 1720,-630;
  applied + undone. Vaguer asks ("carrying on from Wall 2") get a which-way question.
- **R6 fixtures (built):** Draw from my sketch put the Laundry tub on Wall 1 by offset, unlinked
  (a top's cut-out wouldn't follow), and the chat couldn't move it. Now:
  - fixture step `existing` = move a fixture already in the room (label / name) — usually onto
    its cabinet (`on`), linked; Undo puts its old pose back (entry `before`).
  - A benchtop / under-bench item given by wall + offset that lands over a base cabinet goes ON
    that cabinet (along = offset from its centre), so the draw path links sinks itself.
  - Prompt: sinks / basins always on their cabinet; an unknown basin model → catalogue stand-in +
    TBC cloud. Checked on RHK6596 Laundry: "the laundry tub needs to be on BC-02" → moved, linked
    (link 488 / 280 = centred), check ✓ — kept (Mark's fix).
- **R9 spec blocks (built):** "add CAD spec blocks" got loose notes. `spec_block` step {block?
  (default "Spec block"), sections [{heading, text?}]}: the library block's text split into
  title + sections, only the sections asked for kept in template order (text = typed lines in
  place of the live {fields}; a heading the template hasn't got goes last), tagged
  `style.block`, placed on the plan with `blockInsertPoint` right of the walls clear of other
  notes (room annotation_scale), as Insert › block. One per room (refused when the plan has
  one). Undo = the markup undo (removed unless edited). Prompt carries Mark's spec-block rules
  (BENCHTOP / FRONTS + PANELS / CARCASS, + BASIN; no HANDLES / DRAWERS / HARDWARE; TBC colours
  typed; OVERHEADS last; site info → SITE NOTES on the Site notes layer). Checked headless (AI
  Sketch Test, applied + undone). ai_gaps "benchtops" + "spec blocks" marked built.
- **R8 benchtops (built):** "draw 20 mm stone tops, colour TBC" was logged as a gap. `benchtops`
  step {labels?, method?, schedule?, front_overhang?, end_overhang?, corner?} runs F4 → Auto-build
  tops' planner (`planAutoBuild`, Phase 8 rules A-a…A-d) server-side with the dialog's defaults
  (front = btFrontOverhang of the room's handle schedule, bridge 650, mitre corners, skip covered
  cabinets, no waterfalls), anchors each top (`autoAnchor`), sets the named build method /
  schedule on each, one insert; Undo removes the tops unless edited since. Fixture cut-outs come
  from linked fixtures (R6). Room summary lists Benchtops (label | wall | method | schedule) or
  "none yet". Editing built tops (shape, waterfalls, joins) stays F4. Checked headless (AI Sketch
  Test, applied + undone) and built for RHK6596 (Mark's ask): Laundry 1970 × 600 over BC-01–03
  (tub cut-out), Bathroom 1200 × 540 over BC-01–04 — 20mm Stone, "20mm Reconstituted Stone –
  Colour TBC" (batches e1335dc3, 117e9694).
- **R7 handle schedules (built):** "small lip pull, black" — the shop only had Lip Pull 50
  Brushed Nickel and the chat couldn't add one. `handle_schedule` step {name, from_schedule?
  (default: the room's), finish?, level?}: finish copies the schedule's main handle product in
  that finish (same sizes / holes; supplier code, maker code, cost cleared; a note says to check
  them), the new schedule copies the role entries (old main handle → new; push-to-open etc.
  kept), level room / job sets rooms / projects.handle_schedule_id (other rooms re-resolve on a
  job set). Undo puts the room / job back, removes the schedule unless something uses it since,
  and removes the copied product after the re-resolve. Checked headless (AI Sketch Test, applied
  + undone): "small lip pull in black / Matt Black" → new schedule set on the room, all 8 doors
  Lip Pull 50 Black. "Lip Pull 50 Black (small)" from the first test is left in Settings › Handles
  for RHK6596 (supplier code / cost to fill in).
- **R5 copy cabinets from another room (built):** "once the vanity's right we'll duplicate it
  for the Ensuite" — no tool could. `copy` step {from_room, labels, wall, offset?}: the source
  rows as the canvas paste does (all settings; grain group + kick run cleared) placed along the
  wall here at the same spacing (and stand-off), then `dbCopyCabinetChildren` (custom parts,
  shapes, drilling, hides) instead of the definition's parts; overlap check as place; one wall
  face at a time; warns that fixtures on them and joined kicks don't come across. Walls first in
  the same change when the room has none. Checked headless: empty RHK1234 room ← AI Sketch Test
  "duplicate the overheads and base run, same walls" → 3 walls, top line 2340 (to match), 6
  copies @ the same offsets with their fronts / handles, check ✓; undone (the empty "AI Copy Test" room is left in RHK1234).

## Open items (check while building)

- Plan-view markup (only elevations so far); WCNR (overhead blind corner).
- Other users see wall / fixture / note changes only after a reload (cabinets update live).
- **Apply speed:** resolves now run 4 at a time; a 3-step batch applies in ~8.5 s.
  The first resolve in a request is still slow (cold caches).


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
