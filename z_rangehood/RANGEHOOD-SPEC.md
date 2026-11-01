# Part cut-outs + undermount rangehood cabinet (`WRH`) — Spec & Phase Tracker

> Living spec. Generic part cut-outs first (Mark: "lets do generic cutout first"),
> then the undermount rangehood cabinet built on them.
> Update status lines and decisions in the same change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → spec written 2026-11-01. Next: R1 (cut-out data model + holes
> on standard case parts). First real job: RHK6586 WC-04, Sirius SM927EL520
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
5. **First fixed shelf, default 350 up, adjustable**, a normal fixed shelf (its
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
     Holes** joint, no new joint type.
9. **Code `WRH`** (already reserved in the cabinet-codes convention for the
   wall rangehood cabinet). Wall › Appliances.

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

- Placed cabinets: `cabinet_instances.part_cutouts jsonb` (part key → `Cutout[]`).
  Custom parts: `cabinet_custom_parts.cutouts jsonb` (the WUP's Under Panel is one).
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

## Phases

| # | What | Status |
|---|---|---|
| R1 | Cut-out type + `part_cutouts` column; **holes** on standard case parts through resolve → nest / G-code / 3D / cabinet views; tests | [ ] |
| R2 | **Notches** → part outline (true shape), incl. a rect part gaining an outline | [ ] |
| R3 | Cut-outs on **custom parts** (`cabinet_custom_parts.cutouts`) | [ ] |
| R4 | **Cut-outs UI** — Cabinet Edit, per part: add hole / notch, formula fields, preview in the part view | [ ] |
| R5 | **Rangehood block** + `resolveRangehood`: hole, shelf + top notch, flue box, joints, sidebar section | [ ] |
| R6 | **WUP takes the hole** from the cabinets above it | [ ] |
| R7 | **Library `WRH`** (wall, pair of doors, shelf at 350, rangehood defaults) — migration | [ ] |
| R8 | Tutorial (Cut-outs + Rangehood cabinet); first use RHK6586 WC-04 | [ ] |

## Open

- **Shelf 350** — assumed = top of the bottom → underside of the shelf (clear
  space for the rangehood). Confirm.
- **Front piece → sides** — only screwed through the top and shelf (decision 8),
  or also into the sides?
- **Default hole size** — from the Sirius SM927EL520 specs when they come; until
  then the WRH warns while the hole is unset.
