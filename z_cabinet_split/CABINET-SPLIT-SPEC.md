# Cabinet height split — spec & phase tracker

> **Purpose**: split one cabinet into a lower and an upper section at a fixed shelf, so a tall
> unit can be made, carried and fitted in two pieces (e.g. RHK6581 butler's pantry, full-height
> open shelving under the stair). Living spec — update status and decisions in the same change
> as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → S0 spec drafted 2026-10-24 from Mark's description; open questions below
> waiting on Mark before S1.

---

## What it is (Mark, 2026-10-24)

> "right click split, then we need to work out where to split. the way i do it is usually 3mm
> below the top of a fixed shelf, so i split sides and back here. when the cabinet gets put
> together the 3mm lip fits over the fixed shelf and locks it together … right click split
> cabinet height, then right hand side bar shows up with x,y coordinates, and a splitter line
> tool. the app can offer split suggestions with the override by the user."

- The cabinet stays **one cabinet** (one label, one resolve). Only its **sides and back** are cut
  in two at the split height; the top and bottom are unchanged.
- **Where**: 3 mm below the **top of a fixed shelf**. The fixed shelf stays in the **lower**
  section, housed in the lower sides, standing **3 mm proud** of their top edge. The upper
  section (no bottom of its own) drops its sides over that 3 mm lip, which locates and locks the
  two together.
- **Suggestions**: one per fixed shelf (shelf top − 3). The user picks one, or overrides the
  height.
- **UI**: right-click → **Split cabinet height**. The right-hand sidebar shows the split (its
  x / y — y = the cut height), the suggestions, and a **splitter line** on the cabinet elevation
  the user can move. Start simple, see how it looks.

## Proposed (to confirm)

- Data: `cabinet_instances.split` jsonb `{ at: number[] }` (cut heights from the carcass bottom);
  library rows can carry a default. Part keys `left_side` → `left_side` (lower) +
  `split:left_side:1` (upper), same for `right_side` and `back` (case_parts key constraint
  extended).
- The lower sides stop at the cut; the upper sides start there. The back splits at the same height.
- Drilling: the shelf's joints stay with the lower sides; the upper sides' shelf / top joints move
  with them. Nothing drilled across the cut (fixing is the 3 mm lip + hand fixings).
- Drawings: elevation draws the cut line; cut list / labels show "Left Side (lower / upper)".
- Doors are not split.

## Open (Mark)

1. Doors: a door across the cut stays one full-height door?
2. More than one cut per cabinet, or only ever one?
3. Anything joining the two halves besides the lip (dowels / connector holes through the shelf
   into the upper sides)?

## Phases

- [~] **S0** Spec (this file)
- [ ] **S1** Data + resolver: split sides / back, part keys, persistence, tests
- [ ] **S2** UI: right-click Split cabinet height, sidebar (suggestions + height), splitter line in elevation
- [ ] **S3** Drawings / cut list labels / tutorial
