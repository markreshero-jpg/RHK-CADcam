# The `window.__canvasApi` automation bridge

`CanvasClient.tsx` exposes a dev-only automation bridge (`window.__canvasApi`,
non-production builds only). It is the preferred way to script wall/cabinet
work: everything goes through the real placement path (nextLabel, cascade
dims, custom parts, resolve), and when driven in a visible browser the results
render live for the user. Drive it from headless puppeteer (see
`headless-automation.md`) or the Chrome extension's `javascript_tool` on an
open canvas page.

## Methods

All offsets = mm from the wall's start ("from left end").

- `drawWall({x, y, length, angle?, thickness?, height?})` → auto-names Wall N
- `placeCabinet({def: 'B2'|'D2'|'D3-1S2Pot'|…, wall: name|id, offset, dx?})` —
  def name is case-insensitive
- `updateCabinet(labelOrId, {dx?, dy?, dz?, offset?})` — re-resolves parts
  (handy trick: `updateCabinet(id, {dy: same})` forces a re-resolve)
- `getState()` → room/walls/cabinets with computed offsets, plus fixtures
  (pose, linked `cabinet` label, `clash` labels — z_fixtures P4)
- `updateFixture(id, {x?, y?, rotation?, z?, width?, depth?, height?})` — same
  path as the Fixture panel; a pose change re-links to the cabinet under it
- `addUnderPanel([labelOrId, …])` — right-click → Add under panel: one BUP / WUP
  under those base cabinets / overheads (between their outer gables) + Scribe Bottom of its
  thickness on each (z_floating F7)
- `openCabinet(refOrId)` — opens the cabinet edit modal
- `getIssues()` — resolver report per cabinet (used by resolver-report.mjs)

## Gotchas

1. **Never assume wall names** ("Wall 2" etc.) — the room may have been
   cleared between turns and numbering restarts. Call `getState()` first, and
   thread the `id` returned by `drawWall` into `placeCabinet({wall: id})`
   instead of a guessed name (burned once: 4 cabinets landed on the wrong
   wall).
2. **Closures capture React state at render time.** Between successive calls
   that depend on each other (drawWall → placeCabinet on that wall), re-read
   `window.__canvasApi` fresh and `await new Promise(r => setTimeout(r, 400))`
   so state/effect re-registration catches up. ~400–600ms between dependent
   calls is reliable.
3. **Fixtures inserted straight into `room_fixtures` must copy the full
   catalog body** — the same keys as `BODY_KEYS` in
   `app/canvas/[roomId]/useFixtureInteraction.ts`, especially `plan_shape`,
   `elev_shape` and `stretch`. Without them the plan/elevation fall back to a
   plain box (burned once: RHK6581 J05 sink + cooktop drew as rectangles).
   **And the `cutout_*` fields** (`cutout_shape/_w/_d/_radius/_off_x/_off_y`,
   `cut_benchtop`) — cutouts are derived live from the fixture, never stored
   on the benchtop, so a null `cutout_shape` = no hole in the top (burned
   twice: the J05 sink + cooktop had shapes patched but no cutouts). Easiest:
   `insert … select <shared columns> from fixture_catalog where id = …`.
   Then `updateFixture(id, {x, y})` to link it to the cabinet under it.
   **`x` / `y` are ROOM coordinates, not wall offsets**: the fixture's back-left
   corner in its own frame, `rotation` = the cabinet's (local x along the run,
   local y out from the back toward the front). E.g. on a west wall drawn S→N
   (rot 270), a sink 80 off the wall centred at room y C → `x: 80, y: C + w/2`.
   Wall-offset values only work by luck on a wall along y = 0 (burned on RHK6592:
   both sinks landed by the north walls, unlinked, and "couldn't be seen").
   **Moving a fixture that's already linked to a cabinet: use `updateFixture`,
   not a DB update** — on load the pose is rebuilt from its `link_x` / `link_z`,
   so a DB-only x/y change snaps back (RHK6592 basins, 2026-10-29).

## When to use what

Prefer the bridge over UI clicking for bulk build tasks; prefer it over direct
Supabase inserts when app-side logic matters (labels, kick runs, resolution)
or the user wants to watch. For flows the bridge doesn't cover, fall back to
DOM/UI driving — see `ui-driving-tips.md`.

## Multi-part assemblies from one WUP (RHK6478 Study desk top, 2026-11-04)

To show a built-up top (strips, rails, underside) as ONE cabinet instead of a stack of WUPs: place one `WUP`, keep
`rule_overrides.UNDER_PANEL: true` (without it a wall-class WUP hangs from the wall cabinet top line and ignores pos_z),
`updateCabinet {dx, dy, dz, pos_z}` to the assembly box, then replace its `cabinet_custom_parts` with one row per piece:
literal `x / y / z` (cabinet frame: x along the wall, y up from pos_z, z from the wall) + `dx / dy / dz`,
`expressions: {}` (the column is NOT NULL; empty = use the literals). Orientation `flat`: dx = depth, dy = length;
`front`: dx = length, dy = height. Per-piece `no_cnc`, edges, ops (`source_part_key: custom_<part id>`). Re-resolve with a
no-op `updateCabinet {dz}`. Script: `z_plan_automation/_tmp-6478-study-desk1.mjs`.

- **Custom part material = `material_override_id`.** The resolver writes the part role's scheduled material over `material_id` on every resolve, so a different board (glass, a second colour) only sticks with `material_override_id` set to it too (RHK6478 desk glass, 2026-11-05).
