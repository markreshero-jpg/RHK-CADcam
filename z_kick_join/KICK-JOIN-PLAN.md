# Join Kicks Across a Run — Implementation Plan

Status: **built (Stages 1–4 + 6), pending manual test**
Branch: `feature/cabinet-library` (current)
Date: 2026-06-16

> **ARCHITECTURE PIVOT (2026-06-16):** the joined kick is now a **standalone
> "kick assembly"** — its own `cabinet_instances` row (toe-kick only,
> `is_kick_assembly = true`), sized to the run, that you select/move/delete on its
> own and that lists as its own labelled assembly ("KICK n"). This replaces the
> original "lead cabinet owns the merged kick" model. Member cabinets resolve no
> kick; the assembly owns it. Migration `kick_run_separate_assembly` adds
> `kick_runs.kick_cabinet_id` + `cabinet_instances.is_kick_assembly`.
> Resolver: `KickRunInput.role` ('assembly' builds from its own DX/DZ, 'member'
> resolves nothing). Orchestration: `dbJoinKickRun` creates the assembly,
> `syncKickAssembly` re-fits it on member change, `dissolveKickRun`/
> `dbSeparateKickRun` remove it, `dbDeleteCabinet` reconciles. UI: `KickRunMutation`
> (add/patch/remove assembly + merge resolved) applied via `applyKickMutation`;
> assembly excluded from collision/slotting + hidden in plan view.

## Goal

Let the user right-click a base cabinet and join all toe kicks in a straight
run into **one continuous kick** (face + ladder), instead of an individual kick
per cabinet. Oversized runs split into segments at a user-entered size.

### Agreed decisions
- **Merge scope:** whole kick continuous (face *and* interior ladder; spreaders
  respaced over the full run length).
- **Run selection:** auto-detect the contiguous straight run from the clicked
  cabinet.
- **Depth steps:** if members differ in depth, show a warning (OK/Cancel); on OK
  build the whole run's kick to the **deepest** cabinet's front line.
- **Split-to-size:** user can enter the max segment length; oversized runs split
  at that size (seams placed away from cabinet boundaries).

---

## Key architectural insight

The resolver is **per-cabinet**: `resolveCabinet(cab)` knows nothing about
siblings, and `persistResolved` writes `toekick_parts` keyed by
`cabinet_instance_id`. Every consumer (3D, elevation SVG, PartsView, cut list,
optimiser, edge-override cache) already reads `toekick_parts` per cabinet.

So the cheapest, most robust approach is **not** a new parts table — it is:

> **The leftmost cabinet in a run ("lead") owns the entire continuous kick.
> Every other member resolves zero kick parts.** The merged face/ladder are
> written into the lead's `toekick_parts` with a large `DY` (the full run
> length). They are flagged `is_detached` (flag already exists), so extending
> beyond the lead's own footprint is fine — and *every downstream view / report
> / optimiser works unchanged* because it is still just `toekick_parts`.

New table is only for run-level **settings**.

---

## 1. Data model (migration via Supabase MCP)

```sql
create table kick_runs (
  id                 uuid primary key default gen_random_uuid(),
  room_id            uuid references rooms(id) on delete cascade,
  max_segment_length numeric,          -- null = use sheet-length default
  split_mode         text default 'equal',   -- 'equal' | 'exact'
  build_to_depth     numeric,          -- captured deepest DZ at join time
  created_at         timestamptz default now()
);
alter table cabinet_instances
  add column kick_run_id uuid references kick_runs(id) on delete set null;
```

- Members share one `kick_run_id`. Lead = member with smallest `cabT` along the
  wall (computed, never stored — survives moves/deletes).
- `on delete set null` means deleting a member auto-drops it from the run.

## 2. Run auto-detection (the "Join" action)

New helper `app/canvas/[roomId]/useKickRunOps.ts`, reusing `wallDir` / `cabT` /
`cabsBlock` from `geometry.ts` (same toolkit `useMultiSelectOps` uses):

```
detectKickRun(clickedCab, cabinets, wall):
  candidates = cabinets on same wall, floor band (base/tall, not wall, not
               corner v1), has_toekick, toe_type !== 'none', sorted by cabT
  walk left + right from clickedCab collecting neighbours whose edges
  touch within tol (~2mm); stop at a gap or non-kick cabinet
  → return contiguous member list
```

Corners and appliance-gap bridging are **out of v1** (deferred). Fillers/panels
that carry a toekick and touch are included.

## 3. Run-level resolver — `src/lib/resolver/resolveKickRun.ts`

New module mirroring `resolveToekick.ts` but spanning the run:

```ts
resolveKickRunParts(lead: CabinetInput, members: KickRunMember[], r): { parts, errors }
```

- `L` = total run length (Σ member widths).
- `Z` uses **max DZ** across members → `kickFrontZ = maxDZ - TOESCF - TF`
  (agreed "build to deepest"). One straight kick line; under shallower cabinets
  the detached plinth sits proud — correct.
- Scribes: only outer ends keep `TOESCL`/`TOESCR`; internal = 0.
- Spreaders respaced across the whole `L` at `TOESP` centres (fewer verticals).
- Materials: lead cabinet's `toekick_face_material` / `interior_material`.
- Emits `kick_front_face`, `kick_sub_front`, `kick_back`, spreaders — same
  `part_key`s, so rendering/cut-list are unchanged.

`resolveToekick.ts` gets a guard at the top:

```ts
if (cab.kick_run) {
  if (!cab.kick_run.is_lead) return { parts: [], errors: [] }   // members empty
  return resolveKickRunParts(cab, cab.kick_run.members, r)       // lead owns all
}
// ...existing per-cabinet path unchanged
```

## 4. Loading run context — `loadCabinetInput.ts`

When a cabinet has `kick_run_id`, also load the run row + sibling members (id,
order, DX, DZ, materials), compute `is_lead`, and attach
`cab.kick_run = { is_lead, members, max_segment_length, split_mode }`. New field
on `CabinetInput` types.

## 5. Split-to-size

`kick_runs.max_segment_length` drives splitting inside `resolveKickRunParts`:

```
if L <= maxSeg → 1 piece
else:
  n = ceil(L / maxSeg)
  split_mode 'equal' → n pieces of L/n        (no sliver offcut — default)
  split_mode 'exact' → floor(L/maxSeg) pieces of maxSeg + remainder
```

- Each segment = its own `kick_front_face` (+ matching `sub_front`/`back`) row,
  with `sort_order`/X offset per segment.
- A **vertical spreader is forced at every split seam** so segments butt over a
  fixing point.
- Seams land at `L/n` — deliberately **not** at cabinet boundaries.
- Default `maxSeg` = sheet length (materials config) when run value is null.

**UX:** right-click joined kick → **"Kick run settings…"** popover with a
`CalcInput` for *Max segment length* + equal/exact toggle, live
"→ 3 pieces @ 1067mm" preview. The **Join** flow, if the run is already
oversized, prompts inline: *"Run is 3200mm, exceeds 2440mm sheet — split into
pieces of [____]"*. Either change re-resolves the run.

## 6. Context-menu actions — `canvasContextItems.ts`

Add to the single-cabinet group:
- **"Join kicks in this run"** — `detectKickRun`; if depths differ show the
  agreed confirm dialog (*"This run mixes depths (560/580/600mm). Build one kick
  to the deepest (600mm)?"* OK/Cancel) → create `kick_runs` row, set
  `kick_run_id` on members, resolve run.
- When already in a run: **"Separate kicks"** (clear `kick_run_id`, delete run
  row, re-resolve members) and **"Kick run settings…"**.

Guards (disabled with reason): wall units, single-cabinet runs, mixed `toe_type`
where any is `leg` (v1 requires ladder run).

## 7. Orchestration / re-resolve fan-out

Critical wiring — the lead owns all members' kick:

- New `resolveKickRun(runId)` → re-resolves **every** member via
  `resolveCabinetFromDB`. Re-resolving all (not just lead) is self-correcting:
  if the lead changed (leftmost deleted/moved), old lead clears its kick, new
  lead builds it.
- `dbUpdateCabinet` / `dbResolveAndPersistCabinet`: if the cabinet has a
  `kick_run_id`, route through `resolveKickRun(runId)` instead of the
  single-cabinet **fast resize path** (`canvasDB.ts` ~lines 553–560) — the fast
  path skips siblings and would leave the lead's merged kick stale.
- Member delete → `on delete set null` drops it; trigger `resolveKickRun`; if
  <2 members remain, dissolve the run.

## 8. Rendering verification (low-risk, must check)

Parts stay in `toekick_parts`, so plan/elevation/3D/PartsView render
automatically. Confirm no view **clips toekick parts to the cabinet's own
width** — the merged face legitimately extends past the lead's footprint. Audit
`Cabinet3DView.tsx`, `ElevationSVG.tsx`, `PartsView.tsx`.

---

## Build sequence

1. ✅ **DONE** — Migration `kick_runs_join_kicks` (table + `cabinet_instances.kick_run_id`
   + RLS) applied to project `xivrjteialwqmleahkfq`; types added to
   `src/lib/resolver/types.ts` (`KickSplitMode`, `KickRunMember`, `KickRunInput`,
   `CabinetInput.kick_run`). `tsc --noEmit` clean.
2. ✅ **DONE** — `src/lib/resolver/resolveKickRun.ts` (merged ladder, build-to-deepest,
   equal/exact `splitKickSegments`, forced seam spreaders); guard in `resolveToekick.ts`
   (member → empty, lead → `resolveKickRunParts`); kick-run context loaded in
   `loadCabinetInput.ts` (`loadKickRunInput`, orders members by along-wall cabT,
   dissolves runs with <2 live members). 6 unit tests added to `test.ts`, all pass.
   `tsc --noEmit` clean. (Pre-existing unrelated failure: CASE-module "back panel
   full height" test — untouched by this work.)
3. ✅ **DONE** — `canvasDB.ts`: `resolveKickRun(runId)` (re-resolves ALL members,
   returns `Map<id, ResolvedCabinet>`) + `reconcileKickRun(runId)` (dissolves a
   run with <2 members: clears survivor `kick_run_id`, deletes the `kick_runs`
   row, re-resolves). `dbUpdateCabinet` fast-path now skips run members
   (`cached && !cached.kick_run`). `dbDeleteCabinet` captures membership and
   returns reconciled siblings. `CanvasClient`: `applyKickSiblings` helper merges
   re-resolved siblings into `resolvedParts`; `handleUpdateCabinet` fans out via
   `cabinetsRef…kick_run_id`; all 3 delete sites refresh siblings (batch deletes
   made sequential to avoid reconcile races). `CabinetInstance.kick_run_id` added
   to types; room load is `select('*')` so it's carried. `tsc` clean.
   NB still pending: "leave run on drag-away" membership maintenance is a step-4
   concern (a move currently keeps membership and just re-stretches the kick).
4. ✅ **DONE** — `useKickRunOps.ts` (new): `detectKickRun` (contiguous run from the
   clicked cabinet, base/tall + ladder, ≤2mm gap), `runIsContiguous`,
   `eligibleForKickRun`, and the `useKickRunOps` hook (`handleJoinKicks` with the
   mixed-depth `window.confirm` → build to deepest; `handleSeparateKicks`).
   `canvasDB.ts`: `dbJoinKickRun` (create run row + stamp members + resolve) and
   `dbSeparateKickRun` (clear + delete row + re-resolve standalone). Context-menu
   item in `canvasContextItems.ts` (shows "Join kicks in run" / "Separate kicks"
   by `kick_run_id`). `CanvasClient` wires the hook + menu handlers and updates
   `cabinets` membership; `handleUpdateCabinet` now **dissolves the run when a move
   breaks contiguity** (drag-away maintenance) via `runIsContiguous`. `tsc` clean,
   new files lint-clean.
5. ✅ **DONE** — `KickRunSettingsModal.tsx` (right-click kick assembly → "Kick split…"):
   `CalcInput` for max segment length (blank/0 = one piece), equal/exact toggle, live
   "→ N pieces — a / b / c mm" preview via the exported `splitKickSegments`.
   `canvasDB`: `dbLoadKickRunSettings` / `dbUpdateKickRunSettings` (writes `kick_runs`
   then re-resolves the assembly). Wired through `canvasContextItems` (`onKickSettings`)
   + `CanvasClient` (`kickSettingsRunId` state, modal render via `applyKickMutation`).
   `tsc` + lint clean.
6. ✅ **DONE (audit)** — verified no renderer clips toekick parts to cabinet width:
   ElevationSVG `tkElevRect` (rect at `rx+ex`, no clamp), Cabinet3DView/Room3DScene
   `tkBox` (mesh from `p.X/DY`, no bound), ResolvedViews sheet helpers (no clip);
   plan view doesn't draw toekick parts. App compiles + boots (canvas route → 307
   auth redirect, not 500). **Known limitation:** the merged kick lays out from the
   lead's local +X toward the run, which assumes the lead is wall-aligned (local +X
   points along the wall toward the other members). A 180°-flipped lead would extend
   the kick the wrong way — fine for standard straight runs; revisit if it bites.
   Still TODO: visual confirmation in the app + optional group-highlight polish.

## Open decisions before step 4
- **Leg-type runs:** require converting to ladder, or join only the visible face
  and leave legs per-cabinet?
- **Default split mode:** equal pieces (no sliver) or exact-size + remainder?

## Touched files (reference)
- `src/lib/resolver/resolveToekick.ts` — guard, delegate to run resolver
- `src/lib/resolver/resolveKickRun.ts` — **new**
- `src/lib/resolver/resolver.ts` — toe-kick step already calls resolveToekick
- `src/lib/resolver/loadCabinetInput.ts` — load run context
- `src/lib/resolver/types.ts` — `CabinetInput.kick_run`, `KickRunMember`
- `src/lib/resolver/resolveCabinetFromDB.ts` / `app/canvas/[roomId]/canvasDB.ts`
  — `resolveKickRun(runId)`, fast-path bypass
- `app/canvas/[roomId]/canvasContextItems.ts` — Join / Separate / Settings
- `app/canvas/[roomId]/useKickRunOps.ts` — **new** (detect + actions)
- `app/canvas/[roomId]/{Cabinet3DView,ElevationSVG,PartsView}.tsx` — render audit
