# Part cut-outs + undermount rangehood cabinet (`WRH`) — Spec & Phase Tracker

> Living spec. Generic part cut-outs first (Mark: "lets do generic cutout first"),
> then the undermount rangehood cabinet built on them.
> Update status lines and decisions in the same change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → R1 + R2 built 2026-11-01 (holes on the carcass bottom / top /
> rails; notches on those + fixed / adj shelves); R3 2026-11-02 (flat custom
> parts, e.g. the WUP Under Panel); R4 2026-11-02 Cut-outs box in Cabinet Edit
> (in-app check pending); R5 2026-11-02 rangehood block + flue box + Rangehood sidebar
> section (no cabinet has the block until R7). Next: R6 (WUP takes the hole). First real job: RHK6586 WC-04, Sirius SM927EL520
> (TBC-LIST #17 — Mark getting the cut-out specs).

---

## What it is

```
 section, side on (front to the right)               plan of the shelf / top

        back │                                       back panel (full width)
   ┌─────────┼─────────────── top ── notch ─┐        ┌───────┬────────┬───────┐
   │         │▓side▓│        │front│       │        │       │ flue   │       │
   │         │▓▓▓▓▓▓│ flue   │ pc  │       │ door   │       │ notch  │       │
   │         │▓▓▓▓▓▓│ box    │     │       │        │       │200x250 │       │
   ├─────────┼──────┴─ shelf notch ┴───────┤        │      ▓│        │▓      │
   │         │  rangehood space   350      │        │      ▓└────────┘▓      │
   │         │                             │        │      ▓▓▓front pc▓▓      │
   ├─────────┴────── bottom ─[ hole ]──────┤        │                       │
   └══════════ WUP under panel ═[ hole ]═══┘ ▼      └───────────────────────┘
                                         doors drop     sides ▓ outside the notch,
                                         over the WUP   front piece across them
```

An undermount rangehood sits in a hole through the cabinet bottom and the exposed
under panel. The flue rises through a notch in the first fixed shelf, inside a
U-shaped box of carcass board, and out through the same notch in the top. No
rangehood model is drawn (Mark: "noone sees them … i'm happy just to have a hole").

## Locked decisions (Mark, 2026-11-01)

1. **Generic part cut-outs first.** Any part can carry cut-outs. The rangehood
   uses them; so will plumbing U cut-outs (RHK6586), bulkhead A/C cut-outs,
   power points, etc.
2. **Two kinds of cut-out:**
   - **hole** — a closed loop inside the part (rect / rounded rect / circle),
     through or pocket. Stored and machined like the curved-end rib cut-outs
     (`cutouts` on the resolved part, `cutoutsToOp` in the optimiser).
   - **notch** — open to an edge; changes the part's outline (true shape), through only.
3. **Under panel = the existing `WUP`** (z_floating F8): the carcasses over it
   scribe up by its thickness (`SCRBT`), the **doors drop over its front edge**,
   and it can run past the rangehood cabinet under the other overheads.
   The WUP **takes the rangehood hole from the cabinet(s) above it**, in the
   same place in room space, so the two holes always match.
4. **Rangehood hole** through the cabinet bottom (and the WUP under it).
   Width, depth, set-back from the front, left/right offset (default centred),
   corner radius. Edges bare (the rangehood flange covers them).
5. **First fixed shelf, default 350 up, adjustable** — measured from the bottom
   of the cabinet **including the under panel** (WUP underside) to the underside
   of the shelf — a normal fixed shelf (its
   usual drilling / joints), with a **flue notch 200 wide × 250 deep from its
   back edge**, centred (offset editable).
6. **Top gets the same notch as the shelf** — same width, depth and X, lined up
   in cabinet space so the flue runs straight up and out through the top.
7. **Back panel runs full width**, untouched.
8. **Flue box above the shelf, carcass material**, shelf top → top underside:
   - **2 sides**, depth 250 (shelf back edge → notch front), inner faces on the
     notch edges (so the 200 × 250 flue path stays clear). **Front edge taped**
     (Mark: "it will look better").
   - **Front piece**, 200 + 2 × board wide, in front of the sides, covering
     their front edges. **Both side edges taped.**
   - **Screwed through the top and the shelf** — the existing **5mm Dynamic
     Holes** joint, no new joint type. The **front piece also gets screw holes
     into the sides' front edges** (5mm Dynamic Holes front → each side).
9. **Code `WRH`** (already reserved in the cabinet-codes convention for the
   wall rangehood cabinet). Wall › Appliances.
10. **One library item, not options on every wall cabinet** (Mark, 2026-11-02:
    "happy with WRH"). `WRH` is placed like any cabinet; a **Rangehood** sidebar
    section shows only on a cabinet with the rangehood block (like Bulkhead /
    Floating shelf). Variants are saved from a tuned job cabinet via Save to
    library. Generic cut-outs are edited in Cabinet Edit per part (R4), not the
    sidebar. No right-click "Make rangehood cabinet" for now.

## How it's built

### Cut-out data (R1–R3)

```ts
type Cutout = {
  id: string
  kind: 'hole' | 'notch'
  shape: 'rect' | 'circle'          // rect + radius = rounded rect
  w: number | string                // size along the part's width (formula ok)
  d: number | string                // size along its depth / length
  radius?: number
  // position in the part's shape frame: which edge it's measured from + offset
  x: { from: 'left' | 'centre' | 'right'; off: number | string }
  y: { from: 'front' | 'centre' | 'back'; off: number | string }
  edge?: 'front' | 'back' | 'left' | 'right'   // notch only: the edge it opens to
  depth?: number | null             // hole only: null = through, else pocket depth
  source?: 'user' | 'rangehood' | 'linked'      // generated ones are read-only in the list
}
```

- Placed cabinets: `cabinet_instances.part_cutouts jsonb` (part id → `Cutout[]`).
  Custom parts: `cabinet_custom_parts.part_cutouts jsonb` (`Cutout[]`; the WUP's
  Under Panel is one) — see R3 as built.
- Library defaults: `cabinet_definitions.part_cutouts`, **copied to the cabinet at
  placement** (job pinning rule — library edits never move a placed cabinet).
- Fields take formulas (z_formulas engine, `cab.` / `t.` / `part("…")` scopes).
- Resolve: holes → the part's `cutouts` loops; notches → subtracted from the
  part's `outline` (rect part with no outline gets one). Downstream (nesting,
  G-code, 3D `partSolids`, cabinet edit views, cabinet sheets) already reads both.
- Display layers: cut-outs are part geometry, drawn wherever the part is — no
  new layer item. The new WRH parts register under the existing carcass part items.

### Rangehood block (R5)

`cabinet_instances.rangehood jsonb` (normalised like `bulkhead` / `float_shelf`):
`{ hole: { w, d, setback, offset, radius }, flue: { w: 200, d: 250, offset: 0 },
shelf_h: 350 }`. `resolveRangehood` (resolver, after case + internal):
- adds the hole (source `rangehood`) to the bottom, the notch to the first fixed
  shelf and the top;
- emits `rh:flue_l`, `rh:flue_r`, `rh:flue_front` (carcass material + edgeband,
  taping per decision 8) and their 5mm Dynamic Holes joints to the shelf and top;
- the shelf height drives the first fixed shelf's position.
Sidebar: a **Rangehood** section on the cabinet (hole size + position, flue size,
shelf height).

### WUP picks up the hole (R6)

On resolve, a WUP (`UNDER_PANEL`) finds the cabinets over it with a rangehood
hole and adds each one (source `linked`) to its Under Panel, mapped from the
cabinet's frame to the panel's. Moving or resizing the WRH (or the WUP) moves it.

## R1 as built (2026-11-01)

- `src/lib/partCutouts.ts`: `Cutout` type, `normalisePartCutouts`, `holeLoop`
  (rect / rounded rect / circle as bulges), `applyPartCutouts`. Test
  `src/lib/__tests__/partCutouts.test.ts`.
- Migration `migration_r1_part_cutouts.sql` (applied): `part_cutouts jsonb` on
  `cabinet_definitions` + `cabinet_instances`; placement copies the definition's,
  Save to library carries the instance's; copy / paste copies the whole row.
- Resolver step 6e, after joints: formulas see the resolved parts
  (`buildFormulaScope`). A part with a hole gains a rectangle `outline` — the
  optimiser only cuts `cutouts` on a resolver outline — so it nests as a shaped part.
- R1 parts: `bottom`, `full_top`, `front_rail`, `back_rail` (horizontal frame).
  Added 2026-11-02: `crv:bottom` — a curved canopy's (BHCRVFIXP) bottom former,
  same frame; first use RHK6581 J05 WC-02 (Miele DA 2578, 670 × 370 hole).
  Anything else, notches, bad formulas and holes running off the part give a
  `CUTOUT_SKIPPED` warning and aren't cut.
- A Shape Editor override on the same part replaces the outline and drops its
  holes (as for curved-end ribs).

## R2 as built (2026-11-01)

- **Keys are part ids** (`case_bottom`, `case_full_top`, `int_fixed_shelf_0`) —
  the ids partShapes, part hides and the formula engine use (changed from R1's
  bare part keys; no data existed yet).
- `notchOutline`: the part's outline (rectangle if none) less the notch rects,
  on a grid of every x / y, traced back to one counter-clockwise loop. Any
  number of notches, corners included; works on top of an existing
  square-cornered outline (e.g. half-check shelves) and keeps its edge tags.
  An arced / angled outline, or notches that split the part, warn and skip.
- A notch butts against its `edge` (the anchor that way is ignored) and runs
  1 past it. Inner corners come out with the cutter radius — no corner radius.
- Notches first, then holes on the result. Shelves (`fixed_shelf`, `adj_shelf`)
  take notches only — holes need `internal_parts.cutouts` + the optimiser
  reading it (later, if wanted).
- **For R5:** check the shelf / top joint holes along the back edge don't land
  in the flue notch.

## R3 as built (2026-11-02)

- Migration `migration_r3_custom_part_cutouts.sql` (applied) on
  `cabinet_custom_parts`: `part_cutouts jsonb` (the `Cutout[]` list — on the row,
  not the instance's `part_cutouts`, so it travels when custom parts are copied
  with new ids), plus `outline` / `cutouts` — **what the resolve cut**, written
  back like the formula dims (same columns and frame as `case_parts`).
- `customPartCuts` (partCutouts.ts): runs the R1 / R2 cutter on the part, after
  its formulas are evaluated (`resolveCustomParts`; in memory for the library
  preview, `resolveDraftCabinet`). Warnings go on the cabinet.
- **Flat parts only** (frame = carcass bottom: x along its length `dy`, y back
  from the front `dx`). Side / front-standing customs warn "not supported yet".
- Optimiser: `PART_SELECTS.custom_parts` reads `outline,cutouts` — the existing
  path nests the outline and cuts the holes. Cabinet 3D: `partShapes` gives the
  part its outline + holes. Elevation / plan / cabinet sheets still draw custom
  parts as boxes (a hole in an under panel only shows from below).
- Placement copies the definition snapshot's `part_cutouts`; Save to library
  snapshots it; copy / paste copies the row.

## R4 as built (2026-11-02)

- **Cut-outs box** (`PartCutoutsPanel.tsx`) in Cabinet Edit's docked part panel —
  under the part details in the 3D tab (via Cabinet3DView `partPanelExtra`) and
  under Position / Offset in Top / Elevation / Side. Shows only on parts that
  take cut-outs (`cutoutPartInfo`): carcass bottom / top / rails, shelves
  (notches only — no + Hole), flat custom parts.
- Per cut-out: hole (rect / circle, radius, depth blank = through) or notch (edge
  it opens to); W × D; X from left / centre / right + offset; Y from front /
  centre / back + offset. Sizes and offsets take formulas (amber when one).
  Fields save on blur / Enter. Generated ones (`source` rangehood / linked) are
  greyed and read-only.
- **Preview**: a top view, front at the bottom, cut by `previewCutouts` (the same
  cutter the resolve runs, on a plain rectangle), with its ⚠ warnings. The 3D
  view shows the real result after the save's resolve.
- Saving: carcass parts / shelves → `cabinet_instances.part_cutouts` via
  onUpdate (on the `dbUpdateCabinet` fast path, no reload); custom parts → the
  row, then the same fast-path resolve re-cuts it and the rows are reloaded.
- Tutorial `part_cutouts` (Cabinets, intermediate).

## R5 as built (2026-11-02)

- Migration `migration_r5_rangehood.sql` (applied): `rangehood jsonb` on definitions +
  instances (placement copies it, Save to library carries it, fast resolve path);
  every construction-method row gets **5mm Dynamic Holes** for `rh_flue:shelf`,
  `rh_flue:top`, `rh_flue:front` (a shop can change them like any joint default).
- `src/lib/rangehood.ts`: settings + `normaliseRangehood`. Defaults: hole **unset**
  (w / d null → warning, no hole), set back 50 from the bottom's front edge,
  centred, square; flue 200 × 250 centred; shelf 350.
- `resolveRangehood.ts`:
  - `withRangehoodShelf` locks the first fixed shelf **fitting** (open compartment)
    at `y_position = shelf_h` before the interior resolves. Cabinet Y 0 is the
    underside incl. the WUP (the carcass scribes up over it), so that is the
    shelf's underside height. A split's separator shelf isn't moved — warns.
  - Generated cut-outs (source `rangehood`): `rh_hole` on `case_bottom`;
    `rh_flue` notch on the shelf (`flue.d` deep) and `case_full_top` (to the
    same front line in cabinet space). Merged in front of the user's list at
    step 6e. They are **not stored**, so they don't show in the Cut-outs box.
  - Flue box `rh:flue_l` / `rh:flue_r` (turned ±90°, front end taped) and
    `rh:flue_front` (200 + 2T, both ends taped), carcass board + interior tape,
    shelf top → top underside. Layer item: carcass gables.
  - Declared seams: shelf / top (B) into each piece's bottom / top edge (A),
    front (B) into each side's front edge. New `DeclaredSeamGeom.bore_b` bores a
    **flat** part B (shelf up from its underside, top down from its top face).
  - Warns and builds no box: no fixed shelf, no full top, box too wide / deep for
    the shelf, no room under the top.
- **Back-edge holes in the notch** (the R2 note): the cut-out step reports each
  applied notch's gap in cabinet space (`ResolvedCabinet.cutout_voids`, in
  memory); `seamDrillsFor` drops any joint hole whose bore (+2) runs into one —
  both the back's screw and the edge hole it meets. Applies to every caller (3D,
  2D views, optimiser drill sync, hardware list).
- Sidebar **Rangehood** section (`RangehoodSection.tsx`): hole W / D (0 = not
  set, amber warning), back from front, off centre, radius; flue W / D / off
  centre; shelf height.
- Tutorial: with R8 (nothing carries the block until the R7 library item).

## Phases

| # | What | Status |
|---|---|---|
| R1 | Cut-out type + `part_cutouts` column; **holes** on standard case parts through resolve → nest / G-code / 3D / cabinet views; tests | [x] 2026-11-01 (831535c) |
| R2 | **Notches** → part outline (true shape), incl. a rect part gaining an outline | [x] 2026-11-01 |
| R3 | Cut-outs on **custom parts** (`cabinet_custom_parts.part_cutouts`, flat parts) | [x] 2026-11-02 |
| R4 | **Cut-outs UI** — Cabinet Edit, per part: add hole / notch, formula fields, preview in the part view | [x] 2026-11-02 |
| R5 | **Rangehood block** + `resolveRangehood`: hole, shelf + top notch, flue box, joints, sidebar section | [x] 2026-11-02 |
| R6 | **WUP takes the hole** from the cabinets above it | [ ] |
| R7 | **Library `WRH`** (wall, pair of doors, shelf at 350, rangehood defaults) — migration | [ ] |
| R8 | Tutorial (Cut-outs + Rangehood cabinet); first use RHK6586 WC-04 | [ ] |

## Open

- **Default hole size** — from the Sirius SM927EL520 specs when they come; until
  then the WRH warns while the hole is unset (Mark OK'd, 2026-11-01).
