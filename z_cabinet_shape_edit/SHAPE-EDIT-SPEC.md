# Shape Edit — edge types, sub-types and junctions, edited in plan

> **Purpose**: the living spec for editing a shaped cabinet's footprint in the
> plan view with the F7 CAD tools, giving every edge a type + sub-type and every
> corner a junction choice. This is Phase 6 ("Free-form + recognition") of
> `z_cabinet_shape/CABINET-SHAPE-SPEC.md`, grown into its own module. Read that
> spec first — its locked decisions (especially 5, 8, 11, 12) still hold unless
> changed here. Update status lines and decisions in the same change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → **E1 built 2026-10-25** (sub-types in the resolver + the Shape
> section dropdowns, migration applied), in-app check pending — see "E1 notes"
> under Phases. Next **E2** (junctions).

---

## Concept in one paragraph

Right-click a cabinet in plan → **Edit shape**. The room dims, the cabinet's
footprint is highlighted, and the CAD sidebar panel switches to a **shape
toolset**: the same F7 tools (select + grips, line, arc, fillet, chamfer, join,
offset, typed entry, snaps) working on the footprint instead of on annotations.
Click an **edge** → pick its **type** (front / side / back / open) and
**sub-type** (finished gable, unfinished gable, scribe…). Click a **corner** →
pick how the two pieces meet (butt with A or B running through, butt-bevel,
mitre; door-facet corners: mitre / reveal; panel-to-facet: square / bevelled).
Nothing new is stored outside `footprint` — the resolver reads the edge types,
sub-types and junction choices and builds the parts as it does today.

## What exists (2026-10-25)

- `footprint` jsonb on instances + definitions; `segments` with stable
  `edge.id` + `edge.role` (`back` · `side` · `front` · `open` · `scribe`);
  `role_overrides`; `flush_ends` (edge ids); presets with formula vertices
  (`src/lib/cabinetShape/footprint.ts`, `presets.ts`).
- `SideFinish` (`finished | unfinished | neighbour`) is typed on `Edge.finish`
  but **nothing reads it**.
- Roles are picked from a dropdown per edge in `CabinetShapeSection.tsx`.
- Junctions come from rules only: `BACK_JOIN` (which panel runs through at square
  corners), `ANGLE_JOIN` (`butt_bevel` | `mitre`, off-square corners only),
  `flush_ends` (panel end at an angled front: square / bevelled), facet-to-facet
  doors always mitred (decision 9).
- F7 CAD tools (`z_CAD_tool/ANNOTATION-SPEC.md`): `useAnnotationTool.ts` (~1500
  lines) + `CadRibbon.tsx` + `CadPanel.tsx`, geometry in `src/lib/annotations/`.
  They edit `room_annotations` rows only.
- `SaveToLibraryModal.tsx` already has preserve ticks: carcase material, toekick
  material, hinge, slide, exposed interior, and Width / Height / Depth
  (unticked = cascades room → job → shop at placement).

---

## Locked decisions (Mark, 2026-10-25)

1. **Edit in plan, not the Shape Editor modal.** Right-click a cabinet →
   **Edit shape**. Its outline is highlighted and CAD-style tools draw / edit
   its lines in place.
2. **Same tools as F7 CAD**, so there's one way of drawing to learn. Tools that
   make no sense on a footprint (text, leader, arrow, dims, cloud, ellipse,
   circle, blocks) are hidden.
3. **Rectangular cabinets keep their current model for now** (left / right
   neighbour types). Mark expects to change this "at some stage" — not in this
   module. A plain cabinet can still be shape-edited: Edit shape gives it a
   rectangle footprint first (a rectangle footprint resolves to exactly the box
   parts — existing tests).
4. **No `none` type for now** (round 2 — first asked for, then dropped): `open`
   covers it. An edge with nothing built on it is `open`.
5. **Thickness follows the board.** A sub-type that uses a different board
   (e.g. finished gable in a 25 mm exposed product) takes that board's thickness;
   the inset polygon and every junction use the per-edge thickness. Otherwise
   thickness is unchanged.
6. **No fixings / drilling at angled junctions.** Square butts keep whatever
   seams / drilling they get today.
7. **Rules are the defaults; a corner set by hand overrides them.** Square
   corners get the choice too (not only angled ones).
8. **One corner picker for every junction kind** — panel↔panel, panel↔door facet
   (replaces the 3D right-click "Bevel front edge to facet" / "Square front
   edge"), and facet↔facet doors.
9. **Kick and benchtop are not touched** by edge sub-types or junctions this
   module. They keep following the edge's type as today (4b / 4c).
10. **Curved (arc) side / back panels are out of scope.** Arc edges stay
    allowed as `open` / `front` as today; arc `side` / `back` keeps the
    `SHAPE_CURVED_PANEL` error.
11. **Shaped cabinets can be saved to the library** (lifts shape-spec decision 7
    for custom shapes, not only BCNP) **with preserve ticks** — the existing
    modal's Width / Height / Depth + material / hardware ticks, plus
    shape-specific ones (see "Library save"), so it comes out of the library
    with everything already set up.
12. **Spec lives in its own folder** (`z_cabinet_shape_edit/`).
13. **Sub-type list as in the table below.** No "shared with neighbour" side —
    never used (round 2).
14. **A newly drawn edge is a front** (`front / faces`) until changed (round 2).
15. **Code modifier `/CS`** (custom shape) for a library shape that isn't a
    preset, alongside `/AE` `/CC` `/RE` `/TZ` (shape decision 6). The parser
    (`rhk-crm/lib/cabinetCodes.ts`) and the cabinet-codes skill get it at E5.

---

## Edge types and sub-types (decision 13)

| Type | Sub-type | Builds | Material / tape |
|---|---|---|---|
| **front** | `faces` (default) | face grid on the facet (3a) | per face grid |
| | `open` | no doors; top rail kept per TOP_TYPE | — |
| **side** | `unfinished` (default) | gable panel | carcass board |
| | `finished` | gable panel | exposed board, front edge taped exposed |
| | `applied` | unfinished gable + applied end panel outside it | carcass + exposed panel (`applied_panels` layer) |
| | `scribe` | gable with scribe allowance (SCRL / SCRR, or per-edge) | carcass board |
| **back** | `standard` (default) | back panel, BACK_JOIN placement | back board |
| | `finished` | exposed back (island) | exposed board |
| | `scribe` | back with SCRBK allowance | back board |
| **open** | — | no panel; shelves come flush with the outline (2026-10-16 rule), front edges taped | shelf board |

- The old `scribe` **role** becomes side / back sub-type `scribe`. The unused
  `Edge.finish` field is replaced by `sub` (`neighbour` dropped).
- Old footprints are upgraded **on read** (`role_overrides` → `edge_overrides`,
  `role: 'scribe'` → side/scribe, `flush_ends` → junction entries). No DB
  migration — it's all inside the `footprint` jsonb.
- Material picks use the cabinet's existing carcass / exposed / back materials
  (`cab.exposed_material` etc.); no per-edge material picker this module.

## Junctions

A **junction** is the vertex between two consecutive edges. Keyed by the two
edge ids (`"<edgeA>|<edgeB>"`, outline order), never by vertex index, so it
survives vertex moves (shape decision 8). If either edge is deleted the entry is
dropped with a visible warning, never re-attached.

| Edges meeting | Choices | Default |
|---|---|---|
| panel ↔ panel (side / back, any angle) | **butt, A runs through** · **butt, B runs through** · **butt-bevel** (off-square only: through panel flush, stopping panel bevelled) · **mitre** (both bevelled on the corner line, square corners too = 45° each) | BACK_JOIN priority at square corners; ANGLE_JOIN at off-square |
| panel ↔ front facet | **square end** · **bevelled flush to facet** | square (shape decision 12) |
| panel ↔ open | **square end** · **bevelled flush** (angled only) | square |
| front facet ↔ front facet | **mitre** (doors bevelled) · **reveal** (square doors, gap) | mitre (shape decision 9) |

- Stored as `footprint.joins: { [junctionKey]: JoinChoice }`; absent = rule
  default. The panel shows the default as "(rule: butt, side through)" so it's
  clear which corners are hand-set.
- Fixed post between facets (S-c) is **not** in this module — later.
- Mitre / bevel cut-list notes, 3D bevel outlines and plan corners reuse 4a's
  `bevel_lo / bevel_hi` path. No new DB columns.

## Data model (footprint additions)

```jsonc
{
  "segments": [
    { "type": "line", "p0": {…}, "p1": {…}, "p0_expr": {…},
      "edge": { "id": "e3", "role": "side", "sub": "finished" } }
  ],
  "edge_overrides": { "e3": { "role": "side", "sub": "finished" } }, // replaces role_overrides; survives preset rebuild
  "joins": { "e2|e3": "mitre", "e3|e4": "through_b" }               // replaces flush_ends
}
```

- `EdgeRole` loses `scribe` (upgrade on read). New `EdgeSub` per role. Types in
  `src/lib/cabinetShape/footprint.ts`.
- `JoinChoice` = `through_a | through_b | butt_bevel | mitre | square | flush | reveal`.
- Every consumer keeps reading `segments` (shape decision 8).

## Plan edit mode

- **Entry:** right-click a cabinet in plan → **Edit shape** (also from the
  cabinet panel's Shape section). A plain cabinet gets a rectangle footprint
  first. Only one cabinet at a time.
- **On screen:** everything else dims (still snappable); the footprint is drawn
  bold, each edge coloured by type, with corner markers. A small banner:
  "Editing shape — BC-12 · Done · Cancel". Esc with nothing armed = Done.
- **Sidebar:** the F7 CAD panel in a **shape** mode — tools: Select, Line, Arc
  (3 modes), Box (start from a rectangle), Offset / side drag, Fillet, Chamfer,
  Join; snaps; typed entry (Tab → length / angle / X / Y). Below the tools, the
  **edge panel** (type + sub-type of the picked edge) or the **corner panel**
  (junction choice), and the existing Shape section bits (preset, params,
  "Re-apply preset").
- **Picking:** Select tool, click an edge → edge panel; click a corner → corner
  panel. Grips drag vertices; dragging an edge moves it parallel with its
  neighbours stretching (B4 side drag).
- **Frame:** tools work in room plan mm; the footprint is stored cabinet-local.
  Convert through `cabinetToPlan` / its inverse — a rotation, never a mirror
  (shape spec "Plan handedness").
- **New edges** are `front / faces` (decision 14).
- **Ids and formulas** (shape decision 8): moving a vertex keeps ids; splitting
  an edge keeps the id on one half; new edges get new ids; a hand-dragged
  vertex is re-expressed against its nearest bbox side (`W - 250`). Any hand
  edit sets `preset: null`, keeps `from_preset`.
- **Validity, checked live:** one closed loop, no self-crossing, no edge under
  10 mm, at least one panel edge (side / back). An invalid shape can't be saved
  (Done stays disabled, the problem is marked).
- **Save:** Done writes `footprint` (and `dx` / `dz` = new bbox), re-resolves,
  and is **one undo step** in `useCanvasHistory`. Cancel restores. The cabinet's
  `pos_x / pos_y` is adjusted so the shape stays where it was drawn when the bbox
  grows left / back.
- **Layers:** the edit overlay is a transient tool overlay (like Measure), not a
  layer item. New part keys (applied end panel on an edge) map in
  `casePartItem` (`applied_panels`).

### Reusing the CAD tools (engineering note)

`useAnnotationTool` reads and writes `room_annotations` directly. Edit mode
needs the same tools on a different target. Plan: pull the drawing / grip /
fillet / chamfer / join / offset geometry out into `src/lib/annotations/` (much
already lives there) and give the hook a **target adapter** — `annotations`
(today) or `footprint` (a single closed polyline with bulges + edge ids). Do
the extraction as its own step with the annotation behaviour unchanged and
checked before shape mode builds on it. This is the main risk in the module.

## Library save (decision 11)

Extends `SaveToLibraryModal.tsx` (existing ticks listed under "What exists").

**Always kept** (part of the shape, no tick): the outline, edge types +
sub-types, junction choices, the face grid / door + drawer layout on every facet.

**New ticks** (Claude's proposal — Mark to overrule at E5):

| Tick | Ticked | Unticked |
|---|---|---|
| Exposed material | finished gables / backs + applied panels keep the saved exposed board | job / room exposed board |
| Edge banding | keep the saved exposed tape | job default tape |
| Joinery rules | keep the cabinet's BACK_JOIN / ANGLE_JOIN (the defaults behind unset corners) | room / job rules |
| Shape sizes fixed (default **on**) | vertices keep their mm offsets from the sides (a 300 clip stays 300 when the width changes) | vertices scale with the bbox |
| Can flip hand | placement offers LH / RH (mirrored footprint, ids kept) | placed as saved only |

W / H / D ticks work as today — for a shape, an unticked axis means the
footprint is evaluated at the cascaded size (that's what formula vertices are
for). The code gets `/CS` unless the shape is still a preset (decision 15).

---

## Phases

| Phase | Scope | Status |
|---|---|---|
| E0 | Spec + Mark's Q&A | [x] 2026-10-25 |
| E1 | **Types + sub-types in the resolver.** `sub` on edges, upgrade-on-read (scribe, role_overrides; flush_ends moved to E2), per-edge material + thickness (decision 5) through the inset polygon + joins, applied end panel part, finished tape. Pickers added to the existing Shape section dropdowns so it's checkable before plan editing exists. Tests: rectangle footprint = box parts still; every preset × every sub-type stays inside the outline, no overlaps | [x] built 2026-10-25, in-app check pending |
| E2 | **Junctions in the resolver.** `joins` map; through A / B, butt-bevel, mitre at any angle incl. square; panel↔facet + panel↔open square / flush (flush_ends retired); facet↔facet mitre / reveal. Corner dropdowns in the Shape section. Tests as 4a's band-fill tests for every choice | [ ] |
| E3 | **Plan edit mode — picking only.** Right-click Edit shape, dim + highlight, edges coloured by type, click edge / corner → panels in the sidebar, Done / Cancel / undo. No geometry editing yet | [ ] |
| E4a | **CAD tool extraction** — target adapter in `useAnnotationTool`, annotation behaviour unchanged (headless check of the B-phase tools) | [ ] |
| E4b | **CAD tools on the footprint** — grips, side drag, line / arc / box drawing from scratch, fillet / chamfer / join / offset, snaps (walls, neighbours, own points), typed entry; validity; ids + formula re-expression; pos / bbox update | [ ] |
| E5 | **Library** — save shaped cabinets with their footprint (types, subs, joins, formulas) + the new preserve ticks; placement evaluates at the placed size, optional hand flip; `/CS` in the parser + skill | [ ] |
| E6 | Tutorial lesson ("Editing a cabinet shape"), in-app check list | [ ] |

### E1 notes (built 2026-10-25)

- **Data:** `Edge.sub` + `Edge.scribe` (mm); `EDGE_SUBS`, `edgeSub`, `normaliseEdge`
  (legacy role `scribe` → side / scribe, applied in `evaluateFootprint`),
  `footprintOverrides` / `withEdgeOverrides` (replace `withRoleOverrides`; legacy
  `role_overrides` are read under `edge_overrides`), `isWallEdge` (benchtops: a back
  or a side / scribe is a wall edge, as the old scribe role was).
  `buildPresetFootprint` takes `EdgeOverrides`. The unused `Edge.finish` is gone.
- **Resolver** (`resolveShapedCase.ts`): `edgeBuild(cab, seg)` gives each panel edge
  its thickness `t`, set-in `off`, board / tape and applied panel. `shapedInterior`'s
  inner polygon uses `off + t` per edge, so faces, hardware, finger rails and filler
  cleats see the same inside. Panels join on their **panel lines**
  (`offsetPanelLines`, each edge moved in by `panelLineOff` — on a box edge that
  includes the rules' SCRL / SCRR / SCRBK once the sub-type changes that panel).
  `vertexTrim` / `angledEnd` take the neighbour's thickness (`tn`). Box parts (left /
  right side, back) keep their rule-scribe outer face, moved by `off`, at the new
  thickness. Horizontals + shelves whose box rect stopped at a moved / thickened box
  panel move with it (`boxFaceShifts` / `shiftedGrow`).
- **Applied end panel:** `ap:<edge>` — face-kind (`isShapedPanelKey`), layer
  `applied_panels`, label "End Panel (edge)". Exposed board on the outline, ends flush
  in the neighbours' outer planes; the gable is set in by its thickness. DB:
  `migration_e1_applied_panel_key.sql` (part-key check widened, applied 2026-10-25).
- **Scribe:** `edge.scribe` mm; unset = the rules (no change on box edges, 0
  elsewhere). On a box edge only the amount past the rule moves the panel.
- **Front / open:** no face on that facet (`resolveShapedFace` `isDoorFront`); its
  neighbours treat it as an open edge (end reveal, no mitre); a square side next to
  it no longer comes forward to a door.
- **UI:** Shape section: type + sub-type dropdowns per edge, scribe mm box (0 = rules).
- **Tests:** `edgeSubtypes.test.ts` (legacy read; defaults unchanged; finished /
  applied / scribe on 5 shapes incl. box sides, angled sides, diagonal; × back /
  angle / bottom / rail / scribe rules; finished back; bottom + shelf move with a
  thicker gable) and `shapedFace.test.ts` (open facet).
- **Known gaps / check in-app:**
  - The applied end panel is the gable's height and depth only — it doesn't run to
    the floor past the kick or forward past the doors (kick untouched, decision 9).
    Ask Mark whether it should.
  - A **thinner** board than the carcass on a box edge leaves the box parts at their
    old size (small gap). Decision 5 only covers thicker boards.
  - Drilling / seams on a moved or thickened box side / back still come from the box
    seams — check hinge and shelf-pin holes land on the panel.
  - The optimiser names `ap:` parts generically (`normalize.ts` was mid-edit in
    another session; route it through `shapedPartLabel` later).
  - Tutorial waits for E6 (the plan-view editor changes where these are picked).

Later (not this module): rectangular cabinets on the same edge model (decision
3); a `none` edge type (decision 4); kick / benchtop per edge (decision 9);
fixed post between facets; curved side panels (decision 10); fixings at angled
joints (decision 6); recognition / auto-classify (shape spec S-e).

## Q&A log

- Round 1 (2026-10-25): decisions 1–12 (4 later changed).
- Round 2 (2026-10-25): `none` dropped → open (4), no shared side (13), new
  edge = front (14), `/CS` (15), library preserve ticks (11). The "Library save"
  new-tick list is Claude's proposal — Mark to overrule at E5.
