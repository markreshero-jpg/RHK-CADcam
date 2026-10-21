# Floating cabinets (wall-hung, no kick) — spec

Status: **F1–F3 built 2026-10-20, in-app check pending.** Next: F4 tutorial (done with F3), then a Vanity library build-out once Mark saves his first vanities.

## What it is

A base-class cabinet hung off the floor with no kick — e.g. a floating vanity.
Floating is a **setting on a cabinet**, not a cabinet type or a library section
(a floating vanity is still a `B2D` / `D2-LL`). The library gets a top-level
**Vanity** category to hold vanity-sized starting points, floating or not.

## Locked decisions (Mark, 2026-10-20)

1. **No bottom panel by default.** A floating carcass is two gables, a back and
   a top (whatever the top type gives). The back runs down to the carcass bottom.
2. **Optional bottom panel** (per-cabinet tick). When on, it runs **under** the
   gables, full width and full depth, and everything above moves up by its
   thickness (overall height unchanged). It is made from the **exposed /
   external board** (the material schedule's Exposed row) with the exposed
   edgeband, taped front + both ends (not the back edge — it's on the wall).
3. **Edging when floating:** gable **tops and bottoms** taped (added to whatever
   the construction method already tapes, e.g. the front edge), and the **bottom
   edge of the back** taped. Uses the carcass edgeband.
4. **Doors / fronts flush with the carcass bottom.** Already true: a kick-less
   cabinet's faces start at the carcass bottom and the shop's `REVB` is 0.
5. **No hanging hardware / rail.** Use the cabinet's top type (e.g. a back rail)
   for fixing; nothing new.
6. **Default height off the floor: 300 mm** (`FLOAT_Z`, `src/lib/floating.ts`).
   It's just the cabinet's existing "Elevation from floor" (`pos_z`), editable as
   usual.

## How it's stored

No migration. Two construction-rule keys, set at the **cabinet layer** via
`rule_overrides` (so they copy into library definitions and back out at
placement with everything else):

| Rule | Type | Default | Meaning |
|---|---|---|---|
| `FLOAT` | boolean | unset (false) | Floating cabinet |
| `FLOAT_BOTTOM` | boolean | unset (false) | Add the exposed bottom panel under the gables |

The resolver treats a floating cabinet as kick-less whatever `has_toekick`
says (no kick parts, TK = 0), so a stray cascade can't build a kick under it.

## Turning it on / off (Cabinet panel → "Floating" tick, base classes only)

- **On:** `FLOAT = true`, `has_toekick = false`; if it had a kick, `dy -= TOEH`
  (keep the carcass the same size); `pos_z = FLOAT_Z` (300). Leaves any kick run
  first (a member of a kick run can't float — detach it).
- **Off:** delete `FLOAT` / `FLOAT_BOTTOM`, `has_toekick = true`, `dy += TOEH`,
  `pos_z = 0`.
- **Placement:** a definition whose `rule_overrides.FLOAT` is set places at
  `pos_z = FLOAT_Z` (its `has_toekick` / `dy` were saved kick-less already).

## Resolver (F1)

- `caseFloor(cab, r)` in `resolveCase.ts` → `{ TK, floorT, floating, hasBottom }`.
  Interior floor Y = `TK + SCRBT + floorT` everywhere (case, internal, drawer stack).
  - normal: TK = has_toekick ? TOEH : 0, floorT = carcass thickness
  - floating, no bottom: TK = 0, floorT = 0
  - floating + bottom: TK = 0, floorT = exposed board thickness
- Floating + bottom forces the bottom-outside geometry (gables stand on it),
  regardless of the method's `BOTTOM_JOIN`.
- Back bottom face lands on the interior floor (Y = floorT).
- Shaped cabinets (`resolveShapedCase`) don't float yet — out of scope.

## Phases

| Phase | What | Status |
|---|---|---|
| F1 | Resolver: FLOAT / FLOAT_BOTTOM, floor helper, edging, tests | built 2026-10-20 |
| F2 | Cabinet panel tick + bottom tick, on/off transform, placement pos_z | built 2026-10-20 |
| F3 | Library: top-level **Vanity** category | built 2026-10-20 |
| F4 | Tutorial: floating vanity | built 2026-10-20 |
| — | Vanity definitions (sizes TBD with Mark — save from canvas into Vanity) | open |
| F5 | Fixes from the first real job (RHK6570 vanities) — see below | built 2026-10-21 |

## F5 — fixes from RHK6570 (2026-10-21)

- **Edge overrides bug (all cabinets, not just floating).** A re-resolve used to
  re-apply every persisted edge flag as if it were a manual edit, so ticking
  Floating on a cabinet that was already placed never taped its gable ends.
  Hand edge edits now live on `cabinet_instances.edge_overrides` (jsonb, keyed by
  the editor's part id: `case_<key>`, `tk_<key>_<sort>`, `int_<type>_<sort>`,
  `zone_<zoneKey>`). The resolver re-applies only those. Migration:
  `migration_edge_overrides.sql`.
  - **Backfill:** each of the 286 cabinets was resolved fresh. Wherever its saved
    edges differed, the saved value was kept as an override: 93 part edges on 33
    cabinets.
  - **Caveat:** some of those are probably old rule output, not hand edits. The
    Hive bulkhead `bh:fascia` / `bh:sl_front` and curved `crv:face` look like it.
    Clear the key to let the rules apply.
- **Elevation height chain.** It now starts a raised cabinet at its own bottom
  height: floor → 300 → carcass → rest. Done on the canvas and in the Elevation
  Views report.
- **Bench & basin heights.** New layer item `dim_elev_bench`: overall dims from
  the floor to the benchtop top and to a vessel basin's rim, outside the height
  chain. Shown on the canvas and in the report. `app/canvas/[roomId]/benchDims.ts`.
