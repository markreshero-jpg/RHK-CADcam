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
> **RESUME HERE** → spec drafted 2026-10-25 from Mark's Q&A. Open questions at
> the bottom need answers before E1 starts (OQ1 + OQ2 block E1).

---

## Concept in one paragraph

Right-click a cabinet in plan → **Edit shape**. The room dims, the cabinet's
footprint is highlighted, and the CAD sidebar panel switches to a **shape
toolset**: the same F7 tools (select + grips, line, arc, fillet, chamfer, join,
offset, typed entry, snaps) working on the footprint instead of on annotations.
Click an **edge** → pick its **type** (front / side / back / open / none) and
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
4. **Every edge can be `none`.** The resolver adjusts the other parts to suit
   (see OQ1 for how none differs from open).
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
    for custom shapes, not only BCNP). The footprint goes with it — edge types,
    sub-types, junctions and the **formula vertices**, so a library shape resizes
    like a preset. *(Mark wrote "with preserves" — read as this; see OQ5.)*
12. **Spec lives in its own folder** (`z_cabinet_shape_edit/`).

---

## Edge types and sub-types (proposed defaults — Mark to overrule)

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
| **none** | — | nothing on that edge (OQ1) | — |

- The old `scribe` **role** becomes side / back sub-type `scribe`. The old
  `finish: neighbour` becomes OQ1's answer (probably `none`).
- Old footprints are upgraded **on read** (`role_overrides` → `edge_overrides`,
  `role: 'scribe'` → side/scribe, `flush_ends` → junction entries). No DB
  migration — it's all inside the `footprint` jsonb.
- Material picks use the cabinet's existing carcass / exposed / back materials
  (`cab.exposed_material` etc.); no per-edge material picker this module.

## Junctions (proposed)

A **junction** is the vertex between two consecutive edges. Keyed by the two
edge ids (`"<edgeA>|<edgeB>"`, outline order), never by vertex index, so it
survives vertex moves (shape decision 8). If either edge is deleted the entry is
dropped with a visible warning, never re-attached.

| Edges meeting | Choices | Default |
|---|---|---|
| panel ↔ panel (side / back, any angle) | **butt, A runs through** · **butt, B runs through** · **butt-bevel** (off-square only: through panel flush, stopping panel bevelled) · **mitre** (both bevelled on the corner line, square corners too = 45° each) | BACK_JOIN priority at square corners; ANGLE_JOIN at off-square |
| panel ↔ front facet | **square end** · **bevelled flush to facet** | square (shape decision 12) |
| panel ↔ open / none | **square end** · **bevelled flush** (angled only) | square |
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

- `EdgeRole` gains `none`; loses `scribe` (upgrade on read). New `EdgeSub` per
  role. Types in `src/lib/cabinetShape/footprint.ts`.
- `JoinChoice` = `through_a | through_b | butt_bevel | mitre | square | flush | reveal`.
- Every consumer keeps reading `segments` (shape decision 8).

## Plan edit mode (proposed)

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
- **Ids and formulas** (shape decision 8): moving a vertex keeps ids; splitting
  an edge keeps the id on one half; new edges get new ids; a hand-dragged
  vertex is re-expressed against its nearest bbox side (`W - 250`). Any hand
  edit sets `preset: null`, keeps `from_preset`.
- **Validity, checked live:** one closed loop, no self-crossing, no edge under
  10 mm, at least one edge not `none`. An invalid shape can't be saved (Done
  stays disabled, the problem is marked).
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

---

## Phases

| Phase | Scope | Status |
|---|---|---|
| E0 | Spec + Mark's Q&A | [~] drafted 2026-10-25; open questions below |
| E1 | **Types + sub-types in the resolver.** `none` role, `sub` on edges, upgrade-on-read (scribe, role_overrides, flush_ends), per-edge material + thickness (decision 5) through the inset polygon + joins, applied end panel part, finished tape. Pickers added to the existing Shape section dropdowns so it's checkable before plan editing exists. Tests: rectangle footprint = box parts still; every preset × every sub-type stays inside the outline, no overlaps | [ ] |
| E2 | **Junctions in the resolver.** `joins` map; through A / B, butt-bevel, mitre at any angle incl. square; panel↔facet square / flush (flush_ends retired); facet↔facet mitre / reveal. Corner dropdowns in the Shape section. Tests as 4a's band-fill tests for every choice | [ ] |
| E3 | **Plan edit mode — picking only.** Right-click Edit shape, dim + highlight, edges coloured by type, click edge / corner → panels in the sidebar, Done / Cancel / undo. No geometry editing yet | [ ] |
| E4a | **CAD tool extraction** — target adapter in `useAnnotationTool`, annotation behaviour unchanged (headless check of the B-phase tools) | [ ] |
| E4b | **CAD tools on the footprint** — grips, side drag, line / arc / box drawing from scratch, fillet / chamfer / join / offset, snaps (walls, neighbours, own points), typed entry; validity; ids + formula re-expression; pos / bbox update | [ ] |
| E5 | **Library** — save shaped cabinets with their footprint (types, subs, joins, formulas); placement copies and evaluates at the placed size; code (OQ4) | [ ] |
| E6 | Tutorial lesson ("Editing a cabinet shape"), in-app check list | [ ] |

Later (not this module): rectangular cabinets on the same edge model (decision
3); kick / benchtop per edge (decision 9); fixed post between facets; curved
side panels (decision 10); fixings at angled joints (decision 6); recognition /
auto-classify (shape spec S-e).

---

## Open questions (for Mark)

- **OQ1 — `none` vs `open`.** Proposal: **open** = an exposed open end — no
  panel, shelves flush and taped. **none** = nothing built and nothing
  finished — for an edge that sits against another cabinet's gable or a wall
  with no panel of its own: shelves / bottom stop at the outline, no tape, and
  the neighbouring panels butt the outline as if a panel were there. Right?
  *(blocks E1)*
- **OQ2 — sub-type list.** Is the table above right? Anything to add (e.g. side
  `shared` with a neighbour, back `none`/rails only — or is that just type
  `none`)? *(blocks E1)*
- **OQ3 — new edge's type.** An edge drawn from scratch: default to touching a
  wall face → `back`, else `side / unfinished`? Or always `none` until picked?
- **OQ4 — cabinet code** for a library shape that isn't a preset: a `/CS`
  ("custom shape") modifier, or a code typed by hand when saving?
- **OQ5 — "save to library with preserves"** — read as "the shape and its
  settings are preserved, formula vertices included, so it resizes". Or did you
  mean saved shapes appear as **presets** in the preset list?
