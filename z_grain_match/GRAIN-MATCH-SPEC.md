# Grain match — spec

**Status:** G1–G3 built 2026-10-27 (data, right-click, layer, horizontal grain), G2/G3 in-app checks pending. Next: G4.

## Why

Banks of drawer fronts and runs of doors in a woodgrain must be cut so the grain
flows from one front to the next: same sheet, laid out as they hang on the wall.
Today every front nests on its own, wherever it fits. Mark: "right click on a
cupboard and grain match … match groups of cabinets eg. horizontal grain so they
all match up … in elevation click a button and see which cabinets are grain
matched as a quick visual check."

## Locked decisions (Mark, 2026-10-27)

1. **Fronts only.** A group holds the FRONTS (face_zones: doors, drawer fronts,
   false fronts) of its cabinets. Not end panels, fillers or kicks.
2. **Laid out as in elevation.** On the sheet the group's fronts keep their
   wall layout (rows / columns / order); each reveal becomes the cutter gap. The
   group nests as one block.
3. **The group sets grain direction** — Vertical or Horizontal — for all its fronts
   (overrides the front's own). A run of drawers goes horizontal in one click.
4. **Too big for a sheet → split + warn.** Split at cabinet boundaries into the
   fewest pieces that fit, each piece still in elevation layout, on consecutive
   sheets; the optimiser names the group and the split.

Also decided here (follow existing rules):

- **One wall per group** (same wall, same side) — "as in elevation" needs one
  elevation. Selection across walls: the menu item is disabled with the reason.
- **Membership is per cabinet**, stored on the cabinet. Never key by
  `face_zones.id` — fronts get fresh ids on every save (`persistResolved.ts`).
- **Job data, not library** — nothing to pin (job version pinning rule doesn't apply).
- **Display:** a new layer item via the layer registry (DISPLAY-LAYERS-SPEC §
  "adding an item") — no ad-hoc booleans.

## Data (G1)

`z_grain_match/migration_g1_grain_match.sql`:

```sql
create table grain_match_groups (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,                         -- 'GM1', 'GM2' … per room
  direction text not null default 'vertical' check (direction in ('vertical','horizontal')),
  created_at timestamptz not null default now()
);
create index on grain_match_groups(room_id);
alter table grain_match_groups enable row level security;
create policy job_access on grain_match_groups for all to authenticated
  using ((select is_admin()) or can_access_room(room_id))
  with check ((select is_admin()) or can_access_room(room_id));

alter table cabinet_instances
  add column grain_match_group_id uuid references grain_match_groups(id) on delete set null;
```

Removing cabinets / a group only clears `grain_match_group_id`; the group row stays
(undo rewrites whole cabinet rows, so a restored member must still point at a real
group). Groups with no members are swept when the room loads (`useGrainMatch`).
Names number over all the room's groups, so an emptied GM1 isn't reused in that session.

Paste / copy never carries the group (the copy is a new cabinet); Replace keeps it.

## UI — plan + elevation right-click (G1)

Shared builder `canvasContextItems.ts` (acts on `multiSelect` like "Add under
panel"):

- **Grain match ▸ Vertical / Horizontal** — new group from the cabinet / selection
  (cabinets already in another group move over).
- When the cabinet is in a group: **Grain match GM1 (↕ vertical)** header with
  **Switch to horizontal / vertical**, **Remove from GM1**, **Remove GM1**.
- Selection with cabinets not on one wall/side → item disabled, hint "one wall only".
- Cabinets with no fronts can't join (disabled, "no fronts").
- 3D menu: not in v1 (it has no multi-select).

## Elevation check (G2)

- Layer item `grain_match` (group `fronts`, views `elevation` + `plan`, **default off**).
- Elevation: each group's fronts get a tinted fill + outline in a group colour
  and a tag `GM1 ↕` / `GM2 ↔` on the group; unmatched fronts untouched. Plan: a
  thin coloured bar along the matched cabinets' fronts.
- Quick toggle: **Layers ▸ Show grain match** flips the item in the active layer
  set view (if the layer API has no per-session override, add one there — check
  in G2, don't add a canvas boolean).
- Printed elevations + plan follow the layer like everything else (the shop layer
  set — the session toggle is canvas-only).
- Built: `resolveLayerView(set, view, overrides)` takes per-session item overrides
  (CanvasClient `layerOverrides`); groups shared via `src/lib/grainMatchStore.ts`;
  marks in `GrainMatchSVG.tsx` (front tint, tag pill, plan bar) used by ElevationSVG,
  ElevationPrintSVG, CanvasSVG, PlanViewReportSVG. Tag sits on the group's leftmost member.

## Horizontal grain honoured (G3)

Today no front direction is honoured (resolver never sets `face_zones.grain_direction`;
GrainSVG fronts hardcode `'v'`; 3D `grainExtents` goes by part kind). With a group:

- Elevation `GrainSVG` + print: `dir = group.direction === 'horizontal' ? 'h' : 'v'`.
- 3D `woodGrain`: matched fronts in a horizontal group run along their width.
- Optimiser: horizontal-group fronts nest **turned**. NOT the `fprail:`/`ibp:` w↔h swap
  in normalize (that transposes — mirrors — the op frame; fine for rails with no
  machining, wrong for drilled fronts). Built instead: `OptiPart.grain_across` (set in
  normalize from `OptiCabinet.grain_match`, embedded in the snapshot cabinet query) →
  `NestPartInput.grainAcross` → `grainOrient` takes the other orientation. That is the
  placement's true quarter turn, which drills / outlines / labels already follow.
  Checked headless on Test Kitchen BC-01: unturned on a W-grain sheet, hinge cups on
  the hinge edges, no G-code errors.
- Built (elevation / print / 3D): `frontGrainDir(cab)` in ElevationSVG +
  ElevationPrintSVG; `FrontGrainAcrossContext` (woodGrain.ts) provided per cabinet by
  CabinetScene, PartViewer turns zone_* grain to the box width.

## Optimiser (G4)

- Snapshot loads `grain_match_groups` + `cabinet_instances.grain_match_group_id`
  and the front positions (`face_zones.x, y` + `cabT`/`cabBottomZ` → wall coords via
  a new `src/lib/frontWallRects.ts`, reused by the elevation layer in G2).
- Per group, per material (members on different boards → each board its own
  block + warning): build a **block** — the fronts in wall layout, every gap set to
  the nest margin (tool Ø + pad + entry offset), rows / columns / order kept,
  turned as a whole for horizontal grain.
- `nest.ts`: a block is one pseudo-part (grain-locked, placed before singles),
  expanded into member placements after packing. Blocks never rotate off grain.
- Too big → split at cabinet boundaries (fewest pieces that fit), consecutive
  sheets, Stage 4 warning "GM1 split over 2 sheets".
- Only fronts selected in Stage 2 take part; a partly-selected group nests the
  selected members as a block + note.
- Stage 5: dragging a matched front moves its whole block; removing one to
  unplaced breaks the block with a warning.
- Stage 6: unchanged (parts are still cut one by one).

## Outputs (G5)

- Sheet PDF + Stage 4/5 sheet view: block outline + `GM1` tag.
- Part label: line `Grain match GM1 · 3 of 6` (order = elevation, left→right,
  top→bottom).
- Headless run (`headlessRun.test.ts`) uses the same block nesting.

## Tutorial + check (G6)

Tutorial "Grain matching fronts" (Tutorial mode). In-app check on a grained job:
make a vertical drawer bank + a horizontal run, check elevation layer, nest, PDF, labels.

## Progress

- [x] G1 Data + right-click menu — migration applied, `src/lib/grainMatch.ts`,
  `useGrainMatch.ts`, menu in plan + elevation (not 3D). Headless check
  `z_plan_automation/verify-grain-match-g1.mjs` (create / switch / remove OK). Mark's check pending.
- [x] G2 Elevation / plan layer + quick toggle — headless check
  `z_plan_automation/verify-grain-match-g2.mjs` (screens OK). Mark's check pending.
- [x] G3 Horizontal grain in elevation, 3D, nest — `verify-grain-match-g3.mjs`,
  `grain-match-set.cjs` (test helper), nestGrain tests. Mark's check pending.
- [ ] G4 Optimiser blocks + split
- [ ] G5 Sheet / label outputs
- [ ] G6 Tutorial + in-app check
