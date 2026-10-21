# Floating cabinets (wall-hung, no kick) — spec

Status: **F1–F6 built (F6 2026-10-21), in-app check pending.** Next: a Vanity library build-out once Mark saves his first vanities.

## What it is

A base-class cabinet hung off the floor with no kick — e.g. a floating vanity.
Floating is a **setting on a cabinet**, not a cabinet type or a library section
(a floating vanity is still a `B2D` / `D2-LL`). The library gets a top-level
**Vanity** category to hold vanity-sized starting points, floating or not.

## Locked decisions (Mark, 2026-10-20)

1. **Always a carcass bottom.** A floating carcass is a normal carcass minus the
   kick: gables run through to the carcass bottom, the carcass-board bottom sits
   between them, back and top as the method gives. *Changed 2026-10-21 (Mark,
   RHK6570): it first had no bottom unless ticked.*
2. **Optional bottom panel = an extra exposed panel under the run** (`BBP`,
   Vanity category). One panel spans the run between the end panels, exposed
   board to match the other exposed panels, carcass depth, front edge taped.
   Nothing floating-specific: any base run can have one. The carcasses over it
   take a plain **bottom scribe** (their own `SCRBT`, shown in Case Scribes) of
   the exposed board's thickness, so gables and bottom start 18 up and the
   overall height is unchanged. Right-click the cabinets → **Add bottom panel**
   does both; deleting the BBP clears the scribes. The **fronts don't scribe** — they run down to the cabinet bottom
   and cover the panel's front edge. *Changed 2026-10-21 (Mark, RHK6570): it
   was first a per-cabinet exposed bottom under, then between, the gables.*
3. **Edging when floating:** gable **tops** taped, and gable **bottoms** unless
   the cabinet sits on a bottom panel (added to whatever the construction
   method already tapes, e.g. the front edge). Uses the carcass edgeband. The
   back keeps the method's edging (it stands on the bottom now).
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
| `UNDER_PANEL` | boolean | unset (false) | Marker, not a construction rule: this item IS a run bottom panel (`BBP`) — never blocks the carcasses over it, drawn under them in plan, left out of dim chains. Hidden from the rules UI |

(`FLOAT_BOTTOM` existed briefly on 2026-10-21 and was retired in F7 — the
cabinets carry a plain `SCRBT` instead.)

The resolver treats a floating cabinet as kick-less whatever `has_toekick`
says (no kick parts, TK = 0), so a stray cascade can't build a kick under it.

## Turning it on / off (Cabinet panel → "Floating" tick, base classes only)

- **On:** `FLOAT = true`, `has_toekick = false`; if it had a kick, `dy -= TOEH`
  (keep the carcass the same size); `pos_z = FLOAT_Z` (300). Leaves any kick run
  first (a member of a kick run can't float — detach it).
- **Off:** delete `FLOAT`, `has_toekick = true`, `dy += TOEH`,
  `pos_z = 0`.
- **Placement:** a definition whose `rule_overrides.FLOAT` is set places at
  `pos_z = FLOAT_Z` (its `has_toekick` / `dy` were saved kick-less already).

## Resolver (F1)

- `caseFloor(cab, r)` in `resolveCase.ts` → `{ TK, floorT, floating, underPanel }`.
  Interior floor Y = `TK + SCRBT + floorT` everywhere (case, internal, drawer stack).
  TK = 0 when floating; floorT is always the carcass thickness.
- A bottom panel is just `SCRBT` on the cabinet. Faces ignore SCRBT, so fronts
  still run to the cabinet bottom. Gable bottoms are only taped while SCRBT is 0.
- Floating forces the sides-outside geometry (gables run through, the bottom
  between them), regardless of the method's `BOTTOM_JOIN`.
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
| F6 | Always a carcass bottom; bottom panel = `BBP` run panel + carcass bottom scribe (decisions 1–3 rewritten) | built 2026-10-21 |
| F7 | Plain SCRBT instead of the hidden FLOAT_BOTTOM; right-click → Add bottom panel; delete clears scribes; BBP not floating-tied | built 2026-10-21, in-app check pending |

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

## F6 — bottom panel rethink (Mark, 2026-10-21)

Mark: "there is always a bottom in a cabinet. a bottom panel would be an
additional panel (exposed panel) that matches all other exposed panels. then,
there would be a bottom scribe to all carcases of the bottom panel thickness."
One panel under the run between the end panels; fronts cover its edge.

- `BBP` library definition (Vanity): no carcass, one flat Applied Panel
  (`dx = cab.d`, `dy = cab.w`, `dz = t.exposed`, front edge taped), rules
  `FLOAT` (places at 300) + `UNDER_PANEL`. `migration_bbp_library.sql`.
  Place it at the first carcass's offset, width = the run between the end
  panels, dy = 18, dz = carcass depth.
- `cabsBlock` (geometry.ts): an UNDER_PANEL item never blocks / is blocked.
- Plan draws it under the carcasses; plan + elevation dim chains (canvas and
  reports) skip it; the elevation height chain never measures from it.
- WIDE_CABINET only warns on carcasses.

## F7 — Add bottom panel (Mark, 2026-10-21)

Mark: build both (visible scribe + one-step action); "bottom panel could be
used in other places as well. if there is this type of rule attached it may
cause confusion."

- `FLOAT_BOTTOM` retired; existing cabinets migrated to `SCRBT: 18`. The BBP
  lost `FLOAT` (any base run, kick or not).
- `src/lib/bottomPanel.ts`: `bottomPanelRun` (picked cabinets → the run's
  left-most carcass in its own frame, width, depth, panel height = lowest
  carcass bottom above any kick), `carcassesOverPanel` (scribed carcasses
  overlapping a panel), `withoutScribe`.
- Right-click a base cabinet (or a Shift-picked run) → **Add bottom panel**:
  places the BBP at the left-most carcass's position + rotation (so back-side
  and outset cabinets work), dy = exposed thickness, dz = deepest carcass, and
  sets `SCRBT` = that thickness on each carcass.
- Deleting a BBP clears `SCRBT` on the carcasses it scribed (same wall +
  direction, overlapping, SCRBT = its thickness).
- Not handled: moving / resizing a BBP doesn't re-scribe; hand-placed BBPs from
  the library don't scribe anything.
