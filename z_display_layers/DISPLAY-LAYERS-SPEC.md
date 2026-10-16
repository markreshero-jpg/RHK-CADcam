# Display Layers — User-Defined Layer Sets

Status: **Phases 1–3 built (3c complete 2026-09-18), pending manual test**
Date: 2026-09-16

## ▶ RESUME HERE (handoff 2026-09-18)

**Where we are:** Phases 1, 2, 3a, 3b, opacity and **all of 3c** are built — reports
follow a layer set, dimension chains measure only drawn cabinets, the old reports are
retired, and 3D honours ghost + opacity. Type-check, lint (no new errors) and all 207
tests pass. Everything below this section is up to date.

**Verified headless:**
- `verify-layers-opacity.mjs` — 2D per-item opacity. ✅
- `verify-layers-p3c.mjs` — report layer-set picker, kicks-only set, chains. ✅
- `verify-layers-p3c-3d.mjs` — ghost doors read 102 lighter than solid; the manager’s
  3D tab offers opacity + solid/ghost. ✅

**Not verified yet:**
- Canvas *elevation* chains with a partial set (same filter as the reports).
- The downloaded report PDFs after the 3c changes (previews only).
- **For the user to try by hand:** drag / stretch a kick run in plan; hardware models
  (hinges, runners) in a big room, including ghosted; editor edits refreshing room 3D.

**NOT COMMITTED.** The working tree mixes this work with ~90 files of other uncommitted
work (formulas, Replace Cabinet, pinch zoom, benchtops, CNC settings…). User chose to
wait. Options offered: everything on a new branch / everything on
`gcode-post-processor-fixes` / layer files only. Ask again before committing.
The DB side (`drawing_layer_sets` table + rows, incl. the recreated "Design" set) is live.

**Next work:** nothing queued for display layers. Open threads: benchtops are not drawn
in the plan report (not passed to it), and 3D wall labels ignore wall opacity.

**Environment notes:**
- Supabase MCP disconnected mid-session. DB reads / writes to `drawing_layer_sets` work
  via node + anon key (see the verify scripts). DDL needs the MCP / dashboard.
- Headless checks: `z_plan_automation/verify-layers-*.mjs`, `verify-kick-plan.mjs`.
  Rooms: Mark Johnson kitchen `daf9a3e4-0d95-4982-af11-ddee1a8e11c3` (default);
  Void Corner Demo `edb6c46b-4049-4c1b-8d9d-a01b6a05fcf9` (has fillers).
  Scripts that need a temporary set create and delete "ZZ …" sets themselves.
- `window.__canvasApi` has no view switch — click the Plan / Elevation / 3D buttons.
- Headless 3D: drei `<Text>` font CDN is unreachable, but wall labels are in their own
  Suspense so scenes still render.
- Source files are CRLF; exact-match edit scripts must normalise line endings.

## Goal

Replace the hard-coded "Detail" presets with **layer sets that users can create,
save, edit and delete**. A layer set says which parts and objects each view shows
and how it draws them. Example: the "Kicks" set shows only toe kicks.

## Locked decisions (2026-09-16)

1. **Shared across the shop.** All layer sets live in Supabase
   (`drawing_layer_sets`). **Every set is editable and deletable — no locked /
   built-in sets** (revised 2026-09-16). The active set is a per-user preference
   (`userPrefs.layerSetId`), remembered when changed in the canvas or Settings.
2. **One active set for all views** (revised 2026-09-16 — per-view active sets
   were annoying). A layer set still holds separate item settings for **plan**,
   **elevation** and **3D**; choosing a set in the header "Layers" dropdown applies
   it to every view.
3. **Colour and line weight: phase 3** (was phase 2; hardware moved ahead of it
   2026-09-16). Phases 1–2 cover show/hide and line style (solid / dashed / ghost).
   Phase 3 adds per-item colour, line weight and the **background colour of each view**.
4. **Decorative items and appliances are future modules.** Nothing is decorative
   today. Decorative items (plants, tables, etc.) and bought-in appliances will
   each get their own module, and **each must add its own layer items** (see
   "Adding a new object type").

### Implementation decisions (Phase 1)

- **No built-in sets.** The six former presets (Full parts, Line drawing,
  Schematic, Design, Working drawing, Face elevation) are ordinary seeded rows
  (sort order 0–5; Kicks = 6). Old prefs holding preset keys (`full_parts`,
  `builtin:full_parts`) resolve by name via `findLayerSet` in
  `src/lib/displayLayers/legacy.ts`, falling back to the first set. The manager won't
  delete the last remaining set. With no sets at all, views use registry defaults.
- **"Full parts" and "Line drawing" are NOT identical** (the first draft was
  wrong): elevation used the preset id to switch to outline-only rendering. That
  is now a per-view set option, `lineDrawing` (elevation only).
- The old elevation annotation "Internal parts (elevation)" (show internals as a
  ghost while the internal layer is off) is gone. Set the internal items to style
  `ghost` instead.
- The Annotations menu is replaced by **Layers → Manage Layers…**.
- 3D honours show/hide, colour, opacity and the ghost style (3c part 2). Dashed and
  line weight mean nothing in 3D; weight is hidden on the 3D tab and dashed is
  filtered out of its style picker.
- Room 3D **Solid / Wire view** (dropdown on the 3D tab, 2026-10-12) is a render
  style, not visibility: a user pref (`room3DStyle`), not a layer-set option. Wire
  draws every shown part as a faint see-through panel with edges (CabinetScene
  `wire`, same as the cabinet editor) and ghosts walls + benchtops. Layer show/hide
  still gates what is drawn.
- A user set containing "hide everything but X" stores explicit `visible:false`
  entries. Items added by future modules fall back to their registry default, so
  they will **appear** in such sets until someone edits the set.

## Architecture

| File | Role |
|---|---|
| `src/lib/displayLayers/registry.ts` | Item registry, groups, stored-shape types, part-key → item helpers (`casePartItem`, `kickPartItem`, `internalPartItem`, `faceZoneItem`) |
| `src/lib/displayLayers/legacy.ts` | `findLayerSet(sets, pref)`: id → legacy preset name → first set |
| `src/lib/displayLayers/resolve.ts` | `resolveLayerView(set, view)` → `LayerView` (`show`, `style`, `props`, `any`, `setting`, `lineDrawing`); `layerSVGProps`; `sparseViewSettings` |
| `src/lib/displayLayers/useLayerSets.ts` | Hook: built-ins + DB sets, `create` / `update` / `remove` |
| `app/canvas/[roomId]/LayerManagerPanel.tsx` | Right-docked manager; edits preview live on the canvas |
| `CanvasClient.tsx` | Single active set (saved to prefs), preview, header dropdown, passes each view its `layers` |
| `CanvasSVG.tsx` / `ElevationSVG.tsx` / `Room3DScene.tsx` / `WallDimensionChain.tsx` | Renderers — gate everything through `LayerView` |
| `src/lib/displayLayers/cabinetShown.ts` | Does a set draw anything of a cabinet (plan / elevation) — chains + reports |
| `src/components/three/PartViewer.tsx` | `PartAlphaContext` / `PartAlpha` / `alphaMat` — 3D ghost + opacity (3c) |
| `PlanViewReportSVG.tsx` / `ElevationPrintSVG.tsx` + `ReportLayerSetPicker.tsx` | Print reports (3c) — take a `LayerView`; picker in each report toolbar |

Removed: `src/lib/displayConfig.ts` (presets, `LayerId`, `AnnotationId`).

### Stored shape — `drawing_layer_sets`

Migration `drawing_layer_sets`: `id uuid`, `name text unique`, `sort_order int`,
`settings jsonb`, `created_at`, `updated_at`. RLS: `anon_all_` + `authenticated_all_`.

```ts
settings = { plan?: ViewLayerSettings, elevation?: ViewLayerSettings, '3d'?: ViewLayerSettings }
ViewLayerSettings = { items?: { [itemId]: { visible?, style?, color?, weight? } }, lineDrawing?: boolean, background?: string, cabinetFill?: { base?, wall?, tall? } }
```

- Saving from the manager stores **sparse** settings: only differences from
  the registry default. Missing items resolve to the default.
- Unknown item ids are kept on save (they may come from a newer build).
- Seeded rows: the six former presets + **Kicks** (every item hidden except
  `kick_faces` + `kick_spreaders`, all views).

### Item registry (Phases 1–2)

| Group | Items (id — views) |
|---|---|
| Carcase | `carcass_outline` (P,E), `carcass_gables`, `carcass_top`, `carcass_bottom` (P,E,3D), `carcass_back` (P,3D) |
| Kicks | `kick_faces`, `kick_spreaders` (P,E,3D; **plan default hidden**) |
| Fronts | `doors`, `drawer_fronts` (P,E,3D), `false_panels` (E,3D), `door_swings`, `drawer_lines` (P), `door_chevrons`, `drawer_labels` (E) |
| Internals | `internal_outline` (P, default hidden), `adj_shelves`, `fixed_shelves`, `dividers`, `inner_drawers`, `accessories` (E,3D), `shelf_labels`, `inner_drawer_labels` (E) |
| Hardware | `drawer_boxes`, `drawer_runners` (P,E,3D), `inner_drawer_runners`, `hinges`, `machining` (E,3D), `drawer_front_drilling` (E — drawer_front slide bores; also in elevation reports) — **all default hidden in plan + 3D**; `bins` (3D — z_bin_cabinet generic bin, default shown; a bin's rails never draw as runners in 3D) |
| Panels | `applied_panels`, `fillers`, `custom_panels` (P,E,3D) — by parts_library key (3b) |
| Benchtops | `benchtops` (P / E / 3D), `benchtop_edges` (P: profile colour + code, wall edges; E: code on the front edge), `benchtop_joins` (P / E) — edges + joins added by benchtop Phase 3; elevation + 3D views by Phase 3b |
| Room | `walls` (3D) |
| Labels | `cabinet_labels`, `cabinet_sizes` (P,E) |
| Dimensions | `dim_wall_overall`, `dim_base_chain`, `dim_wall_chain` (P), `dim_elev_height`, `dim_elev_floor_chain`, `dim_elev_wall_chain` (E), `dim_kicks` (P,E; default off — plan: kick board chain between the base row and the overall + kick depth at the wall ends on lane 2; elevation: kick height per kick, `src/lib/kickDims.ts`; not in reports yet) — chain items to be replaced by user-defined rows (`settings.<view>.dimRows`), see `z_dimension_rows/DIMENSION-ROWS-SPEC.md` |

Retired ids: `hardware` (Phase 1: hinges + inner-drawer slides, elevation) was
split into `hinges` + `inner_drawer_runners`. Stored rows were migrated
2026-09-16, and the old `drawer_boxes` setting also seeded `drawer_runners`.
`shelves` was split into `adj_shelves` + `fixed_shelves` (user request,
2026-10-11) so each can be styled on its own. No row migration: `SPLIT_FROM` in
the registry lets each new item inherit a stored `shelves` setting until it has
its own, and `sparseViewSettings` moves the old setting onto both on the next save.
Elevation's placeholder shelf lines (cabinet not yet resolved) follow `adj_shelves`.

Notes:
- Plan draws toe-kick parts (outline, toekick colour), including kick assemblies
  (which behave like cabinets; see below).
- Plan walls are not layer-controlled (walls carry the drawing/selection UI).
- **Only what's shown is selectable, and only what's shown gets labels** (user
  decision, 2026-09-16; replaces the Phase 1 "hit targets always stay" rule):
  - Plan / elevation: a cabinet's hit area is the extent (union bbox) of everything
    it currently draws, e.g. kick parts only in a kicks set. Nothing drawn means no
    hit area, and no cabinet name / size text even when those items are on.
    Clicking where a hidden cabinet would be falls through to the wall.
  - Plan kick assemblies behave like cabinets (user request, 2026-09-16): name +
    size labels, click / right-click / double-click, drag to move, move crosshair
    and left / right / front stretch markers. They draw only their kick parts (no
    full-depth footprint, except a dashed footprint while stretching, when resolved
    parts are stale). The label sits 150mm behind the kick face, clear of member
    cabinet labels and the front marker. They render under the other cabinets, so
    where members are also shown the member wins the click.
  - 3D: no bounding-box overlay. The drawn part meshes are the hit targets.
  - Selection shows a dashed ring around the hit extent when the carcase is hidden.
  - Dimension chains (plan + elevation, canvas + reports) measure only cabinets the
    set draws (user decision, 2026-09-17): `planShowsCabinet` / `elevationShowsCabinet`
    in `src/lib/displayLayers/cabinetShown.ts` mirror the hit-extent rules above —
    keep them in step.
- 3D's unresolved-cabinet placeholder box follows the carcase items.
- Elevation section cut past the face still reveals internals regardless of set.
- Measure tools (plan, elevation and the 3D plane-to-plane tool, `Measure3D.tsx`,
  added 2026-10-11) are transient tool overlays, not layer items. 3D picks
  raycast the rendered meshes, so only faces the set draws can be measured.

## Phases

### Phase 1 — foundation ✅ built
- Registry, built-ins, `drawing_layer_sets` table + Kicks seed + RLS, prefs
  migration (old preset names → built-in ids; new `3d` default).
- Plan / elevation / 3D gated through `LayerView`; `displayConfig.ts` removed.
- Layer Manager panel (new / duplicate / rename / delete / show-all / hide-all /
  group toggles / per-item style / line drawing / "Use this set") + one header
  dropdown for all views + Settings default set.
- Plan draws kicks.
- Verification: `z_plan_automation/verify-layers-p1.mjs` (headless screenshots).
  (Phase 1 note, fixed in Phase 2: 3D with walls visible rendered blank headless because the drei
  `<Text>` font CDN (cdn.jsdelivr.net) is unreachable from headless Chrome here.
  Wall labels now have their own Suspense.)

### Phase 2 — hardware + room 3D fidelity ✅ built (2026-09-16, pending manual test)
Decisions (2026-09-16): hardware before appearance; real hardware models in
3D; hidden hardware must cost nothing. No extra hardware types for now
(handles, shelf pins, legs, LEDs register later with their own modules).
- Hardware group split out (see registry). Elevation gates hinges / drawer boxes /
  drawer runners / inner-drawer runners / hand-added machining separately.
- Plan draws drawer box + runner footprints (optional, default hidden). Metal-sided
  drawer systems only have `db_bottom` + `db_back` parts, so that is all plan shows.
- **Room 3D renders every cabinet with `CabinetScene`** (exported from
  `Cabinet3DView.tsx`, the cabinet editor renderer) instead of its own simplified
  part renderer. The room now matches the editor: part position / size / rotation
  overrides, drawn shapes (Shape Editor), added parts (`show_in_room`), door
  profiles, real hinge + plate + runner models, drawer boxes, drilling and hand ops.
  `CabinetScene` takes `layers?: LayerView`; omitted (editor) = show everything.
- Hidden hardware is not rendered, so its GLB models are never fetched. Each room
  cabinet has its own `<Suspense>`, so a loading model only hides that cabinet.
- Room overrides + shapes load in two queries (`dbLoadRoomPartDetails` in
  `canvasDB.ts`) and refetch when the resolved-parts map changes (after an edit).
  Hand-added ops (`useHandOpMarkersMulti`) load only while `machining` is shown.
- Room selection: parts are **passive** in the room (`PassivePartsContext` in
  `PartViewer.tsx`: no part-level pointer handlers or hover). R3F raycasts every
  descendant of the cabinet group (which has the handlers), so clicking or
  right-clicking any drawn part selects the cabinet, and hidden parts can't be hit.
  A bounding-box overlay was tried and removed: it made hidden parts selectable.
  Without passive parts, editor handlers swallowed door clicks and right-clicks.
  Selected cabinet = whole-cabinet amber tint, via a proxy material map (user
  preference, 2026-09-16).
- Room outlines: `CabinetScene roomOutlines` uses the part-palette colours (carcase /
  toekick / internal / door / drawer_face / drawer_box) the room used before, not the
  editor's black `PANEL_OUTLINE`. Edge-tape strip outlines are skipped for passive
  parts.
- Wall labels (drei `<Text>`, font from CDN) are in their own `<Suspense>`: the
  room 3D no longer blanks while the font loads, and headless 3D now renders.
- Shared hardware box maths: `src/lib/drawerHardwareBoxes.ts` (`dbBox`, `slideBox`).
- Verification: `z_plan_automation/verify-layers-p2.mjs` (needs a temporary set
  showing 3D hardware) + `verify-layers-p2-select.mjs` (3D click / right-click).
- Not done: plan / elevation don't apply part overrides or shapes yet (3D only).

### Phase 3 — appearance + gaps (split 2026-09-16)

#### 3a — colour, line weight, background ✅ built (2026-09-16, pending manual test)
- `ItemSetting` gains optional `color` (#rrggbb) and `weight` (multiplier;
  `WEIGHT_OPTIONS` ½/1/1½/2/3). `ViewLayerSettings` gains optional `background`.
  All unset = renderers draw exactly as before. Sparse save keeps only set values.
- `LayerView`: `color(id, fallback)`, `colorOf(id)`, `w(id, base)` (base × weight),
  `background`.
- **Plan / elevation:** colour replaces the item's stroke, and its fill where the
  renderer fills with the part colour (gables / back strips, custom panels,
  runners, elevation part rects). Weight scales line width. For text items
  (cabinet names / sizes, drawer / shelf / inner-drawer labels) weight scales
  font size. Selected / hover / multi-select highlight colours still win.
  Cabinet-outline fill keeps the per-class fill (colour = outline stroke only);
  the per-class fill itself is a per-view set setting — see "Cabinet fill" below.
  Dimension chains (plan `WallDimensionChain`, elevation chains) take colour +
  weight. Their label backing chips follow the view background.
- **3D:** colour = part outline colour (room palette fallback) via
  `makeOutline(room, palette, layers)`. `walls` colour = wall material. Weight and
  style are not used in 3D (hidden on the 3D tab).
- **Background:** plan `<svg>`, elevation wrapper + `<svg>`, 3D `<Canvas>`.
- **Layer Manager:** per-item colour swatch (dashed chip = default; × resets),
  weight select, style select, plus a "Background colour" swatch per view tab.
  Panel widened to 540px.
- Verification: `z_plan_automation/verify-layers-p3.mjs` (needs a temporary set
  with overrides).

- **Cabinet fill (added 2026-10-12, user request) — built, not verified in the app:**
  `ViewLayerSettings.cabinetFill { base?, wall?, tall? }`, plan + elevation only
  (corner classes follow their parent). Replaces the hard-coded `CAB_FILL` lookups in
  `CanvasSVG` / `ElevationSVG`, including the place / drag / follow previews, via
  `LayerView.cabFill(cls)` / `cabFillSel(cls)`. Unset = `CAB_FILL` / `CAB_FILL_SEL`.
  With an override, the selected fill is derived (`selectedFill`: lighter, at least
  60% saturation), so there's no second picker. Layer Manager: Base / Wall / Tall swatches
  under Background colour on the **Plan tab only**, plus a fill-only opacity
  select (`cabinetFillOpacity`, multiplies the outline style's fillOpacity; the
  outline stroke keeps the Cabinet outline opacity). Reports ignore it (prints
  ignore colours). Test: `__tests__/cabinetFill.test.ts`.
  Elevation (2026-10-12, user choice, trial): controls hidden on the Elevation tab,
  because resolved cabinets draw in part-palette colours and the class fill only
  shows on the loading / resize fallback rect. `ElevationSVG` still reads the
  elevation values, so with nothing stored it draws the defaults. Open: the user may
  later want a class tint behind resolved elevation cabinets instead.

- **Dimension offset (added 2026-10-15, user request) — built, not verified in the app:**
  `ItemSetting.offset` (mm, unset = 0; sparse-saved), `LayerView.offset(id)`. Layer
  Manager: an Offset number box (step 25; negative allowed, pulls the dim in; focus and
  Enter select the whole value) on Dimensions-group rows. Plan
  (`WallDimensionChain`): rows are cumulative, so each row moves out by its own offset
  plus every row inside it (wall-cab → base → kicks → overall), and the end-of-wall
  depth dims move out by their own item's offset. Depth-dim lanes now sit at
  half steps (`0.5 + lane`) so they fall between a return wall's chain rows instead
  of on top of them (the likely cause of the back-wall overlap the user reported; unconfirmed). Elevation: wall chain
  up, floor chain down (the overall wall length follows it), height chain left, kick
  marks right. Reports ignore offsets (own chain copies).

- **Opacity (added 2026-09-17, user request):** `ItemSetting.opacity` (multiplier;
  `OPACITY_OPTIONS` 100/75/50/25/10%), `LayerView.op(id)`. `props()` multiplies the
  style opacity by it, so it works with solid / dashed / ghost. Also applied to
  items that don't use props: cabinet names / sizes, door swings, drawer lines,
  benchtops, plan + elevation dimension chains, chevrons and drawer / shelf /
  inner-drawer labels. Plan + elevation only (hidden on the 3D tab, like weight and
  style; 3D transparency belongs with 3c "ghost in 3D").
  Verification: `z_plan_automation/verify-layers-opacity.mjs`.

#### 3b — added-part categories ✅ built (2026-09-17, pending manual test)
- **No schema change.** Added parts (`cabinet_custom_parts`) already point at
  `parts_library`, whose `key` says what they are. The planned new column was
  unnecessary. There is no separate "end panel" part: end panels are applied panels.
- Items (group Panels): `applied_panels` (key `applied_panel`), `fillers`
  (`filler_strip`), `custom_panels` (kept id, relabelled "Other added parts" = any
  other key: scribe mould, nailer, gusset…).
- `src/lib/displayLayers/customPartKinds.ts`: `customPartItem(part)`,
  `ROOM_CUSTOM_PART_COLS` (select incl. `parts_library(key)`), `withLibraryKey(rows)`,
  and a `part_library_id → key` cache (`rememberLibraryKeys`, fed by the join and by
  PartsView's library list) so live editor updates without the join still classify.
- `ResolvedCustomPart` gains optional `part_library_id` / `library_key` (room
  loaders: `useMaterialColours`, `dbResolveAndPersistCabinet`).
- Plan / elevation / 3D (`CabinetScene`) pick the item per part for show / hide,
  style, colour, weight, hit area and 3D outline colour.
- Stored sets: each view's existing `custom_panels` setting was copied to
  `applied_panels` + `fillers` (only Kicks had one) so hide-everything sets stay hidden.
- Verification: `z_plan_automation/verify-layers-p3b.mjs` (creates and deletes its
  own temp set; use `ROOM_ID=edb6c46b-…` Void Corner Demo for fillers, the default
  Mark Johnson kitchen for applied panels).

#### 3c — reports + 3D ghost (part 1 ✅ built 2026-09-17; part 2 not started)
Decisions (2026-09-17, user):
1. **Picker per report, default = active set.** "Plan View" and "Elevation
   Views" (formerly "… (New)") each get a Layer set dropdown. It starts on the canvas's active set;
   the last pick is remembered per report (localStorage `plan-view-layer-set` /
   `elevation-print-layer-set`, falls back to the active set). Their old drawing
   toggles (labels / dimensions / faces / door swings / drawers / shelves / drawer
   boxes / toe kick) are gone.
2. **Reports honour show / hide, style, weight, opacity** (+ elevation "line
   drawing" = no face shading). **Colours and background are ignored** so prints
   stay black on white. With style `solid`, internals / hardware / door swings /
   drawer lines / chevrons keep the report's own print dash; `dashed` uses a
   1.6 / 0.8 paper-mm dash (`props(id, 5 / scale)`).
3. **Page extras stay report toggles, not layer items:** plan = wall names, wall
   hatch, title block; elevation = return walls, title block. Walls, ceiling /
   soffit reference lines and the wall title always draw.
4. **Chains measure only drawn cabinets** (also on the canvas — see Notes).

Built:
- Plan report now draws resolved parts like the canvas: carcase parts, kick parts
  (kick assemblies under members, labelled behind the kick face), drawer boxes /
  runners, added parts, interior marker, cabinet sizes. The class-shaded footprint
  = `carcass_outline`; its inset line only when the cabinet isn't resolved.
- Elevation report: every kick part (not just the front face), added parts, inner
  drawer runners, cabinet sizes; items split as on the canvas (faces by zone type,
  chevrons, drawer labels, hinges, internals by type). The overall wall length goes
  with `dim_elev_floor_chain`. Cabinets the set doesn't draw are skipped entirely.
- **Old reports retired (2026-09-17, user):** the original "Plan View" (`PlanDrawingSVG`,
  SVG download) and "Elevation Views" (`ElevationReportSVG` + `generateElevationPDF`)
  were deleted; the layer-aware reports took their names (ids stay `plan_view_v2` /
  `elevation_view_v2`).
- Not done: benchtops in the plan report (not passed to it).
- Verification: `z_plan_automation/verify-layers-p3c.mjs`.

#### 3c part 2 — ghost + opacity in 3D ✅ built (2026-09-18)
- `LayerView.alpha(id)` (resolve.ts) = ghost style (`GHOST_ALPHA` 0.25) × item opacity.
  3D has no line style, so **dashed draws solid** there.
- `PartAlphaContext` / `<PartAlpha a={…}>` + `alphaMat(a)` in `PartViewer.tsx`: the room
  3D view wraps each drawn thing in the provider, and `Part` (panels + edge tape),
  `HingeModel`, `SlideModel` (GLB / STL / OBJ / fallback box), the wall meshes and the
  unresolved-cabinet placeholder all render see-through from it. Transparent panels set
  `depthWrite: false` so they do not occlude what is behind them. A GLB reuses shared
  materials, so `GlbInner` clones them before going transparent.
  The cabinet editor passes no layers → alpha 1 → unchanged.
- **Gotcha (cost an hour):** three keeps a material’s compiled program when
  `transparent` flips on a live instance, so switching sets left parts opaque. Every
  affected mesh is now keyed by whether it is transparent (`meshKey` in `Part`, and a
  `key` on the wall / placeholder / STL / fallback meshes), which remounts the material.
  Don’t remove those keys.
- Layer Manager: the 3D tab now shows **opacity** and **style (solid / ghost)** —
  dashed is filtered out there; line weight stays 2D-only.
- Verification: `z_plan_automation/verify-layers-p3c-3d.mjs` — ghost doors must read
  much paler than solid ones (mean colour of the door run), plus manager screenshots.
- Not covered: the drei `<Text>` wall labels ignore wall opacity.

### Later modules (must register their items)
- Decorative items (plants, tables…) → `Decorative` group.
- Appliances (bought-in) → `Appliances` group.

## Adding a new object type (rule for every future module)

Any module that adds something drawn on the canvas (plan / elevation / 3D) must:
1. Add its item(s) to `LAYER_ITEMS` in `registry.ts` with a sensible `default`, correct
   `views`, and a new `LayerGroup` if needed. Never rename an existing id.
2. Gate its rendering with `layers.show(id)` / `layers.props(id, zoom)` in each view
   that draws it.
3. Decide whether existing shop layer sets should hide or restyle it. They're shop
   data in `drawing_layer_sets`, not code, so update the rows or tell the user.
4. Not add ad-hoc visibility booleans or annotation flags.
