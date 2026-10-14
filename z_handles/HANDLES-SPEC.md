# Handles & Finger Pulls — Spec

**Status:** H1–H3 committed (f96e204); H6a + H6b built 2026-10-14 (unit-tested, uncommitted). Next = H5 (per-door overrides).
**Owner module:** `z_handles/`
**Touches:** resolver (face zones, rules), handle catalogue + schedules,
display layers, optimiser / G-code (drilling + routes), reports.

---

## 1. Goal

Every door and drawer front resolves to a **grip**: a bought handle, a
finger pull worked into the door edge, or nothing (push-to-open). The grip:

- is chosen by a schedule that is richer than Cabinet Vision's
  (door vs drawer, plus role and size rules), with cabinet and door overrides;
- changes face sizing where it needs finger room (the 20mm finger gap);
- is drawn in elevation, plan and 3D through the display layer registry;
- produces machining when the CNC does the work (handle holes, routed pulls),
  and a workshop note when it doesn't (sharknose on the table saw);
- feeds hardware counts and costing in reports.

## 2. What exists today (baseline, 2026-10-13)

| Piece | Where | State |
|---|---|---|
| `hardware_handles` (name, brand, handle_type bar/cup/knob/recessed/other, length, bore_centres, projection, finish, cost_per_unit, active) | Materials library → Handles tab, `app/library/materials/MaterialsClient.tsx:149` | Exists. No hole count/diameter, no position. |
| `handle_schedules` (one `handle_id` per schedule, `hw_single`) | `app/library/schedules/SchedulesClient.tsx:19` | Exists. One handle for everything. |
| `handle_schedule_id` on shop_settings / projects / rooms | Job properties, settings | Exists. No cabinet level. |
| Chain room → job → default | `app/canvas/[roomId]/CabinetSheetReport.tsx:76-102` only | **The resolver never loads handles.** |
| Output | Cabinet sheet line: (doors + drawers) × handle name | Only use of handles. Not drawn, not drilled, not in cutlists. |
| Finger-gap sizing | `REVT` / `REVB` / `GAPR` in `ConstructionRules`, merged via `rule_overrides` shop → job → room → cabinet (`loadCabinetInput.ts:524-529`) | Mechanism exists; no finger-pull rule. |

Reusable infrastructure:
- **Generated back-face ops**: `src/lib/optimiser/seamDrillSync.ts` (hinge cups,
  drawer-front fixings tagged `face_back`). This is the model for handle holes and routed pulls.
- **Back-face route path to G-code**: `sheetDrills.ts` → `routes.ts` → `gcode.ts emitRoutes`.
  Every route currently runs on the back (material-up) pass, so back-face finger
  pulls need **no** front/back flip (`z_part_view/RHK-DoorFaces-PhaseB-TwoSidedMachining.md` stays independent).
- **Schedule-with-entries pattern**: `slide_schedule_entries` (schedule → many rows).

## 3. Vocabulary

- **Grip**: what a face zone is opened by. Has a *kind* (§4 D1).
- **Grip edge**: the face edge the fingers or handle work from. Default top
  for base and tall, bottom for wall (D5).
- **Finger gap (`FPGAP`)**: the clear space left at a grip edge so fingers
  fit behind the front. Shop practice: **20mm** between carcass top and top drawer,
  and 20mm between each drawer or opening that has a finger pull.
- **Matching rail**: a strip of door-matching board (18mm satin with
  satin doors, 16mm Polytec Woodmatt with Woodmatt doors…) cut into the carcass at
  the opening position, visible through the finger gap.

## 4. Locked decisions

**D1. One concept, several grip kinds.** A finger pull is a catalogue entry
like a bar handle; the user picks "Sharknose 40°" the same way as "Bar 160". Kinds:

| kind | What it is | Machining | Phase |
|---|---|---|---|
| `hardware` | bar / cup / knob (existing types) | CNC through-holes, back pass | H2 |
| `sharknose` | back bevel on the grip edge | **None.** Done on the tilting table saw (workshop note) | H3 |
| `routed` | finger-pull channel routed in the back face at the grip edge | CNC back-face route | **Parked**: shop doesn't cut these |
| `push` | push-to-open mechanism: a real catalogue item, costed, on job hardware reports (D12) | **None.** The 10mm hole is drilled by hand; shown visually later | H1 (catalogue + reports), later (visual) |
| `rail` | matching backing rail behind a finger gap (§7) | carcass part | H6 |
| `channel` | recessed aluminium (Gola-style) | carcass | H7, rarely used |

**D2. Don't reuse door profiles.** `door_profile_operations` are decorative,
front-face, inset routes that only show on screen. Grips get their own
geometry and op generation.

**D3. Sharknose is a workshop operation.** Cut on the tilting table saw. The system:
draws the true bevel in 3D and section views, sizes the face correctly, and puts a
note on the cutlist and labels (edge, angle). No G-code. Catalogue fields:
`bevel_angle_deg` (saw blade tilt from vertical, default 45) and `bevel_land_mm` (edge thickness left at the front, default 0); bevel run along the face = (thickness − land) × tan(tilt). Applies to **doors
and drawer fronts** alike.

**D4. Finger gap is a rule, `FPGAP`, default 20mm.** It lives in `ConstructionRules`,
so the existing `rule_overrides` chain gives shop → job → room → cabinet
override for free. When a zone's grip kind needs finger room (`sharknose`,
`routed`, `rail`; configurable per catalogue entry via `needs_finger_gap`), the
gap at its grip edge becomes `FPGAP` instead of `REVT` / `REVB` / `GAPR`.
Per-door override comes later (H5).

**D5. Grip edge defaults by cabinet class**: base → top, wall → bottom.
Each zone can override it. Wall cabinets are a straight mirror of base: sharknose
on the bottom edge, 20mm finger gap at the carcass bottom, handle 50mm up from
the bottom. Base doors with sharknose behave like a top drawer: the door top
drops `FPGAP` (20mm) below the carcass top.

**D10. Tall cabinets default to push-to-open.** Tall doors are plain doors
with a PTO mechanism: no grip edge, no finger gap. This is the default
`door_tall` row in the shop's handle schedule (grip kind `push`), so it can be
overridden like any other row.

**D6. Handle schedules become role-based** (like `slide_schedule_entries`).
A schedule holds rows of:
`role` (door_base / door_wall / door_tall / drawer), `handle_id`, and
placement (`position` top/bottom/centre, `offset_from_edge_mm`,
`orientation` horizontal/vertical, `align` centred/hinge-side/handle-side).
Shop placement defaults (seeded into the catch-all rows):
- **Drawers**: handle centre 50mm down from the top of the front, centred left
  to right, horizontal.
- **Doors**: 50mm down from the top (wall doors mirrored: 50mm up from the
  bottom), 50mm in from the **non-hinged** edge. Hinge side comes from
  `face_zones.hinge_side`.

The existing single `handle_id` migrates into these role rows.

**No size bands (locked).** The program never picks a handle length from
drawer or door width. Handle ranges don't come in every size, so an
automatic pick could drill holes for a handle that can't be bought. One
handle per role; a different size is a deliberate cabinet-level (or later
per-door) override.

**D12. Push-to-open is a catalogue item.** PTO mechanisms live in
`hardware_handles` (grip kind `push`) with cost, so they're chosen in schedules
like any handle and appear on job hardware reports and costing. **No CNC
machining**: the 10mm hole in the carcass side or shelf edge is drilled by hand.
Visual (a 10mm cylinder) is deferred, low priority.

**D7. Assignment chain**: zone override (face_grid zone `handle_id`) → cabinet `hardware_overrides.handle_schedule_id`
→ room → job → shop default. The **resolver** owns the chain and writes a
resolved grip onto each zone. `CabinetSheetReport`'s private copy of the chain is removed.

**D8. Bought handle holes**: generated as back-face through-holes on the
door part (same as hinge cups via `seamDrillSync`). The catalogue gains
`holes jsonb` ([{offset_x, offset_y, dia}] from the handle centre; a bar is two
holes at ±bore_centres/2, a knob is one) and `hole_dia_mm`.

**D9. Display**: register a `handles` item in the layer registry
(`z_display_layers/DISPLAY-LAYERS-SPEC.md` reserved it); all grip rendering is gated through it.
No ad-hoc toggles.

## 5. Data model (as built in H1, migration `z_handles/migration_h1_handles.sql`)

```
hardware_handles  (extend)
  + grip_kind          text  check in ('hardware','sharknose','routed','push','rail','channel')  default 'hardware'
  + needs_finger_gap   bool  default false   -- true for sharknose/routed/rail
  + holes              jsonb default '[]'    -- hardware only
  + hole_dia_mm        numeric
  + bevel_angle_deg    numeric               -- sharknose
  + bevel_land_mm      numeric               -- sharknose (renamed from bevel_depth_mm in H3)
  + route_params       jsonb                 -- routed: width, depth, length mode (full/centred length), tool_id
  + model_url / svg    text                  -- optional display geometry (later)

handle_schedule_entries  (new)
  id, schedule_id → handle_schedules, role, handle_id → hardware_handles, position, offset_from_edge_mm, orientation, align, sort_order

cabinet_instances.hardware_overrides.handle_schedule_id   (jsonb key, no new column — the existing override channel)
face_grid zone .handle_id   (jsonb, survives re-resolve; face_zones is rebuilt every persist)
face_zones.handle_hardware_id (existing column, now written) + face_zones.handle jsonb (resolved placement)
ConstructionRules.FPGAP       (new rule, default 20)
ConstructionRules.RAILH       (new rule, default 45)   -- H6
ConstructionRules.RAILUP      (new rule, default 5)    -- H6
```

New tables need RLS policies (see access-control memory and `z_access_control/`).

## 6. Phases

| Phase | Scope | Status |
|---|---|---|
| **H0** | This spec, decisions, open questions | ✅ done 2026-10-13 |
| **H1** | Schema (§5); role-based schedule editor in Library → Schedules; cabinet-level schedule picker; resolver loads the chain and puts a resolved grip on each zone; cabinet sheet reads the resolved grip (counts per handle) | ✅ built 2026-10-13 — see H1 notes below |
| **H2** | Bought handles end to end: elevation + 3D + plan drawing through the `handles` layer; hole generation → optimiser → G-code | ✅ built 2026-10-13 — see H2 notes. Job-level hardware list not built (no job hardware report exists yet) |
| **H2b** | Switch handle holes off: room, cabinet, and per door/drawer front (D13) | ✅ built 2026-10-13 — see D13 |
| **H3** | `FPGAP` rule + grip-edge gap sizing in `resolveFace`; `sharknose` kind: 3D bevel, elevation hidden line, cut-list saw note | ✅ built 2026-10-13 — see H3 notes |
| **H4** | `routed` kind: back-face route → G-code | **parked**: shop doesn't cut routed pulls (2026-10-13) |
| **H5** | Per-door overrides UI: grip, grip edge, finger gap, handle offset | not started |
| **H6a** | Backing rail parts + side notches (geometry), rules RAILH / RAILUP / FPRAIL, layer item, cut list | ✅ built 2026-10-13 — see H6 notes in §7 |
| **H6b** | Notch routing on the sides → CNC; knock-in block holes; front rail push-back; rail grain | ✅ built 2026-10-14 — see §7 |
| **H7** | Recessed aluminium channel (rare) | parked |

**H1 notes (2026-10-13):**
- Migration applied to live: grip-kind columns on `hardware_handles`,
  `handle_schedule_entries` (+ library_read / admin_write RLS), `face_zones.handle`.
  Seeded a "Push to open" item and a default "Standard" schedule (D Handle 160 on
  base/wall doors + drawers, PTO on tall doors).
- Resolver: `loadCabinetInput` → `loadHandleInputs` (cached, falls back to a
  schedule's legacy `handle_id` when it has no rows); `resolveHandles.ts` sets
  `zone.handle` (role, grip edge, centre x/y in zone mm, orientation); tests in
  `src/lib/resolver/__tests__/handles.test.ts`.
- Placement convention: `offset_from_edge_mm` measures to the handle's **nearest
  hole** (a vertical bar's top hole sits 50 down; its centre is a further
  bore_centres/2). `inset_from_side_mm` measures to the hole line. A door hinged
  top/bottom grips on the opposite edge, centred.
- UI: Library → Schedules → Handles is a 4-row role editor; Materials → Handles
  has a Kind column; the cabinet panel has a "Handle schedule" override.
  Per-door override UI is H5 (the resolver already honours `zone.handle_id`).
- Cabinet sheet groups handles by resolved name.
- Live check: `node z_plan_automation/verify-handles-h1.mjs <roomId>`. Needs
  AUTOMATION_EMAIL/PASSWORD in `.env.local`.

**H2 notes (2026-10-13):**
- Holes: `resolveHandles` adds `handle.holes` (zone-local) + `hole_dia`. A bar
  gets two holes at ±bore_centres/2 along the handle, a knob (no bore centres)
  one centre hole, and a non-empty catalogue `holes` jsonb overrides both.
  `hole_dia_mm` null → 5mm. Only `grip_kind = 'hardware'` is drilled.
- CNC: `seamDrillSync` section 4 writes one generated `part_operations` row
  per hole (`kind: 'handle'`) on the front, `face_back`, depth = front
  thickness (the G-code through-hole overshoot applies). Facet / turned fronts
  of shaped cabinets are skipped, like their hinges.
- Display: layer item `handles` (Hardware group; elevation + 3D on, plan off).
  Shared geometry is in `src/lib/handleGeometry.ts`, and the 2D glyph is in
  `HandleSVG.tsx`. Drawn in:
  - the elevation canvas, the print elevation and the cabinet editor's front
    view (hole centres shown with drilling);
  - plan, as the projection footprint;
  - 3D (`Handle3D`): a D-bar or knob that swings with the door and slides with
    the drawer.
- Handle holes are their own layer item, `handle_holes` (elevation + 3D, on by
  default). They're drawn from `handle.holes`, so switching drilling off (H2b)
  makes them disappear with no extra rendering work.
  - Elevation: an orange ring plus a centre cross.
  - 3D: an orange through-bore, visible from the back and when the bar is hidden.
  - Cabinet editor front view: shown with its drilling toggle.
- Cabinets saved before handles (column NULL) or before holes re-resolve once
  on canvas load (`needsResolve` in `dbLoadResolvedParts`).

**D13. Handle holes can be switched off (user, 2026-10-13)** at three levels:
room, cabinet, and per door / drawer front. The handle is still listed and
costed, it just isn't drilled. Built in H2b:
- Rule `HANDLE_DRILL` (boolean, unset = drill) in `ConstructionRules`, carried
  by the existing `rule_overrides` cascade (job → room → cabinet). It's kept out
  of the construction-method rule editor (`constructionRuleConfig.RuleKey`).
- Per front: face_grid zone `handle_drill` (undefined = inherit), which wins.
- `resolveHandles`: off → `holes = []`, `drilled: false`. The CNC rows, the
  elevation / 3D hole markers and the 3D posts all follow, because each reads
  `handle.holes`.
- UI:
  - Room dialog → Hardware tab → "Handle Holes".
  - Cabinet panel → under Handle schedule.
  - Face grid editor → selected door / drawer → "Handle holes".
- Not built: a job-level control in Job Properties (the rule already cascades
  from the job if one is added).

**H3 notes (2026-10-13):**
- Migration `z_handles/migration_h3_sharknose.sql` renamed `bevel_depth_mm` to
  `bevel_land_mm` and seeded "Sharknose 45°" (finger gap on, tilt 45, land 0).
- `FPGAP` (default 20) is a real construction rule:
  - Listed in the Face Reveals group (construction methods, job and room
    overrides), plus a per-cabinet box in the cabinet panel.
  - `resolveFace` checks each front's grip (`fingerGapEdge`) before sizing rows.
  - A top-grip front widens the gap above its row (the top reveal for the top
    row); a bottom-grip front widens the gap below.
- `resolveHandles.zoneGrip` is shared by the gap sizing and the handle
  placement, so they always agree.
- Sharknose:
  - `handle.bevel = { angle_deg, land, run }`.
  - 3D: the front renders from its side profile (`PartShape extrude: 'across'`,
    `handleGeometry.sharknoseProfile`).
  - Elevation: an amber band from the grip edge to a dashed hidden line at the
    bevel's back edge, labelled "SN 38°" when there's room (`handles` layer).
  - Cabinet editor side view: the removed wedge, shaded.
  - The shop's true angle is 38° (user, 2026-10-13); the seeded item was renamed "Sharknose 38°".
  - Cabinet sheet: the cut list says e.g. "Drawer Face SN T45°", and sharknose
    is left out of the hardware list.
- Catalogue columns: Hole ⌀, Finger gap, Tilt°, Land mm.
- Known gaps:
  - The face grid editor's schematic preview still uses fixed reveals.
  - Per-door finger gap is H5.

H1 is the foundation; H2 and H3 can then run in either order. H3 is the
likely first visible win, since sharknose is the most common case and needs no machining.

## 7. Matching backing rail (H6)

**D11. Rail geometry (locked 2026-10-13).** A strip of board matching the doors
(18 satin for satin doors, 16 Polytec Woodmatt for Woodmatt…) fixed behind
**every** door and drawer finger gap, including the top gap under the carcass top. The gap then shows door colour, and the cabinet isn't open to the air.
Defaults, as rules:

| Rule | Default | Meaning |
|---|---|---|
| `RAILH` | 45mm | rail height |
| `RAILUP` | 5mm | how far the rail runs up behind the front **above** the gap |
| (derived) | `RAILH − FPGAP − RAILUP` = 20mm | how far it drops behind the front **below**, leaving room for the sharknose bevel |

```
   ┌──────── drawer above ────────┐
   │                              │  ← rail top: 5mm up behind it
   └──────────────────────────────┘
          20mm finger gap            ← rail face visible here (door colour)
   ┌──────── drawer below ────────┐  ← sharknose bevel on this top edge
   │                              │  ← rail bottom: 20mm below its top
```

Material: the zone's door colour → its board (existing colour → board link),
so rail thickness follows the board.

**Fixing (locked 2026-10-13):** the rail sits in a notch cut out of each carcass
side, the **full thickness of the side**, so the rail runs the full carcass
width. Each finger-gap seam therefore adds a notch op on both sides plus one rail
part. The shop doesn't use drawer divider rails, so the rail adds a part and
replaces nothing.

**Knock-in blocks (corrected 2026-10-13):** rails are fixed into the notches with
small knock-in blocks, each set in a 10mm hole. Block holes are a later
H6 sub-phase, deferred until the handle work is right.

**H6a as built (2026-10-13):**
- `resolveFingerRails.ts`: one rail per finger-gap seam, made from the resolved
  zones (`handle.finger_gap` + grip edge), after `resolveHandles`.
  - Rails are case parts keyed `fprail:<n>`, classed with the shaped
    `side:` / `back:` keys in `isShapedPanelKey`, so every view and sizing path
    treats them as face-kind panels (DX = height, DY = width, DZ = thickness).
  - DB check `case_parts_part_key_check` extended (`migration_h6_fprail.sql`).
- Geometry:
  - Full carcass width (X 0..DX), front face flush with the sides' front edge,
    thickness and board from the front it backs.
  - Height = RAILUP above the gap + FPGAP + (RAILH − FPGAP − RAILUP) behind the
    bevelled front.
  - At the carcass top (base) / bottom (wall) gap the rail is clamped to the
    carcass, so it's 40 tall with defaults. **Decision taken in build — confirm.**
- Side notches: each side's `outline` gets a rail-thickness × rail-height notch
  at its front edge.
  - It shows in 3D (the shaped-part path). Outline isn't sent to the CNC, so
    **the CNC sides are not notched yet**.
- Rules:
  - RAILH (45) and RAILUP (5) are in the construction rules (Face Reveals group).
  - FPRAIL (unset = on) switches rails off per room (Hardware tab) or per cabinet.
- Display: layer item `finger_rails` (Carcase group).
- Labels:
  - Cabinet sheet cut list: "Finger Rail n". Optimiser parts list: "Finger Rail n".
  - No edging (the edges sit hidden in the notches and behind the fronts).
- Not yet:
  - Shaped (footprint) cabinets get no rails.
  - No clash check against drawer boxes or the carcass front rail.

**H6b decisions (user, 2026-10-14) + build:**
- **Front rail:** pushed back by the backing rail's thickness when a top
  backing rail is present (`pushFrontRailBack`). A `full_top` is not adjusted yet.
- **Notches** (refined by the user, 2026-10-14): cut right through the side,
  **rail thickness deep** for the full rail height.
  - At each **closed** end there's a relief: `RAILCUT` (5) deeper, over one
    cutter width (10 high). That puts the round cutter's corner behind the rail,
    so the rail's back corners seat square.
  - An end that runs out through the side's top / bottom edge (the top rail)
    has no corner and gets no relief.
  - `seamDrillSync.collectNotchRoutes` writes, per rail per side:
    - one generated through pocket (`kind: 'fprail_notch'`), run 5mm past the
      front edge, and past the top / bottom where open, so those mouths are
      square;
    - one generated groove per closed end: a 10mm slot from the rail's back
      face out past the front, whose round end reaches 5mm deeper.
  - The overruns are inside the nest gap, which is at least the tool Ø and
    cleared by the profile cut.
  - Tool: the active 10mm router bit with the lowest tool number (T101 today).
    No 10mm bit means the notch is skipped with a warning.
  - The side outline draws the notch with square reliefs.
- **Knock-in blocks:** one hole per rail per side, into the side's inner face.
  - Ø `RAILBLKD` (10) × `RAILBLKZ` (12) deep.
  - Centre `RAILBLK` (15) behind the back of the rail, at mid rail height.
  - Generated drill `kind: 'fprail_block'`.
- **Grain:** `RAILGRAIN` horizontal (default, along the rail) or vertical.
  - Set per room (Hardware tab) or per cabinet.
  - Persisted to `case_parts.grain_direction`.
  - The nest turns vertical rails (`normalize.ts`); rails carry no machining,
    so turning them is safe.
- New rules sit in a "Finger Pull Rails" group: RAILH, RAILUP, RAILCUT,
  RAILBLK, RAILBLKD, RAILBLKZ.
- Display: the sharknose amber shading (elevation band and side wedge) was
  removed at the user's request, leaving the dashed line and "SN 38°" label.
  Rails are hidden in plan by default.
- Tests: `src/lib/optimiser/__tests__/fingerRailOps.test.ts`, plus the rail
  cases in `handles.test.ts`.

## 8. Open questions

Answered 2026-10-13:
- Routed pulls aren't used (H4 parked).
- Sharknose on doors and drawers.
- Tall = plain push-to-open doors (D10).
- Wall = mirror of base (D5).
- Base sharknose doors drop 20mm like a top drawer (D5).
- Rail 45mm = 5 up / 20 gap / 20 down, behind every finger gap including the
  top, notched full side thickness, fixed with knock-in blocks, no divider
  rail (D11, §7).
- Push-to-open is a costed catalogue item, hand-drilled, no CNC (D12).
- No size bands (D6).
- Placement 50mm from the grip edge, drawers centred, doors 50mm in from the non-hinged edge (D6).

Still open (none block H1):
1. Rail details for H6 (§7): notch position, top-rail height, knock-in block holes.
2. Push-to-open visual (low priority).
