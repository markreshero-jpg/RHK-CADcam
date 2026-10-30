# RHK6595 Caloundra Kitchens — 1/21 Parkedge Rd, Sunshine Beach

Drawings: `SynologyDrive/_JOBS/RHK6500 - 6599/RHK6595 - CKC - 1-21 Parkedge Rd Sunshine/ARCHITECTURALS/Park Edge Dr, Sunshine Beach.pdf`
(Caloundra Kitchens job #3431, client Jenny & Greg Kenny, Liam G 28/10/2026, rev 0, 10 pages: plan, benchtop,
elevations, 3D, appliance list).

## Job-level setup (2026-10-30, `z_plan_automation/_tmp-6595-setup.mjs`)

- Project `0ebb6866-f1ff-4fcf-b000-17dceb207df4`, cloned from RHK6592. TOEH 100. Class dims base 930/560, wall 747/320, tall 2340/580.
- Doors per the title block: **lower = LX Colour 16mm Winter Sky** (new colour `d57653a2`, material `38d56943`, finish Flint)
  on base + tall + panels; **upper = LX ABS Grain 18mm Sublime Teak** (new colour `bd47d2f0`, material `d67d85b0`) on wall class.
  Face colours are guesses (#56677a / #a8713f).
- Handles: new **Handle House C128 Maleny** (`82f50f69`, satin nickel, 128 centres, length 140 assumed) + schedule
  **Handle House Maleny 128** (`f9dfa969`): horizontal on base doors / drawers / tall doors; overheads push-to-open.
- Kick face Whiteboard 16.5 (drawing: "16.5mm Carcase White Panel").

## Mark's answers (2026-10-30)

1. Colours as per the title block; ABS Grain in 18mm, Winter Sky in LX 16mm. 2. Appliance cupboard = normal doors, bi-fold later.
3. Column above the bench set back (500 carcass). 4. Appliance cupboard + 390 over = ONE carcass. 5. Both drawer runs 202/323/302.
6. Base panels below the bench; wall fillers + panels above. 7. Overheads 320 carcass. 8. Island top 20 overhang both sides.
9. 400 drawers under the cooktop. 10. Melamine as loose parts in their own room + CAD showing it.
11. Microwave sits in the microwave (appliance) cupboard. 12. Sink is drop-in; drawn undermount for now (no drop-in in the library).
13. Overheads adjusted to suit: 765 overall, top 2340, 625 clear over the 950 bench.

## Rooms

- **Kitchen** `d113bd53-5e4a-4ded-9592-cc1f7bc0eecb` — layout `z_plan_automation/layouts/rhk6595-parkedge-kitchen.json`,
  post-draw fixes `_tmp-6595-fix1.mjs`. Resolver clean.
  - W2 sink wall (E->W): BEPF 16.5 | D3 711 | D3 711 | B2D 700 sink (rails on edge) | BEPF 16.5 | 608.5 DW | BEPF 16.5. KICK 1 joined.
  - Above: WEP front filler 16.5 | WC-02 W2D 711 x 1390 x 500 column on the stone (1000 doors w/ Maleny handles hinged 100/880,
    fixed shelf, 390 PTO doors, bottom Removed) | WEP 18 seen side | 3 x W2D 672 x 747 (SCRBT 18) + WUP 2016 set back 20 | WEP 18.5 front filler.
    Bulkheads 100 over both (oversized, cut on site).
  - W4 = the melamine closure line (16 wall, soffit 274): WC-10 open box 890 x 436 x 690 over the fridge, 3 x 3 cubbies of 124 left; BH 274 over.
  - W6 island (back-to-back line y 302): front BEPF 16.5 | UBO 600 | D3 690 (top false, 400 x 178 boxes) | D3 689; back 3 x B2D 264 deep
    PTO (BC-02 BACK_JOIN between_sides for the downdraft vent). **Island kicks not joined** — joinKicks hangs on the mixed-depth modal
    (backs 264 / fronts 560 on the same line). Each cabinet has its own kick.
  - CAD text notes: W4 melamine closure, plan closure note, W2 microwave cupboard, W6 cooktop.
- **Loose Parts** `e01106df-71c7-4db4-9165-3bfc69daa21e` — TC-01 carrier (TEPF) with fixed custom parts: 1 x 2400 x 900 + 2 x 2400 x 70
  Whiteboard 16.5, no tape (`_tmp-6595-loose.mjs`).

## Open

- Benchtops (2780 x 600 wall run; island 2016 x 900 with 20 waterfall east end), sink/tap/cooktop/oven fixtures, spec blocks — not drawn.
- Bosch PVQ811H26E spec sheet not in the job folder — drawer depth 400 is a placeholder; cooktop cutout is wider than the 690 cabinet.
- Island kick join. Handle length.

## Rev 1 (Mark 2026-10-30) — WC-10 cubbies half-checked

- New feature z_dividers V5 (half-check crossings): WC-10's cubby block flagged `half_check`. 2 dividers full height (400),
  2 shelves full width (400), notched 18.2 wide (18 teak + 0.2) to the depth middle + 5 (336 of 672); shelves from the back,
  dividers from the front; no joint drilling (fixed through top / bottom / gables).
- Cubbies resized for the 18 board: block 400, rows + columns equal = 121.3 square (drawing's 124 was for 16 board).
  Applied with `_tmp-6595-hc.mjs`; the layout JSON now carries it.

## Rev 2 (Mark 2026-10-31) — appliance cupboard bi-fold

- WC-02's 1000 appliance doors are now a Finista BF-05 sliding bi-fold (z_bifold_slide), **hung on the left**, **no bottom
  guide** (the cabinet bottom is Removed, it sits on the stone), standard centre hinges. The 390 PTO doors + fixed shelf over stay.
  Set as `rule_overrides` BIFOLD L / BIFOLD_BOTTOM none (WC-02 stays its own cabinet, not swapped to W2D/BF, so its two rows stay).
- Needed a resolver change (d2c5fa2): the bi-fold can be one row of a multi-row front, and the top track hangs under the fixed
  shelf over the pair (underside 991.5): carriage cups at 944 / 880 on the leading door, 22.5 in.
- Outer (left) door keeps its 100 / 880 hinges, no handle; leading door has the one handle at the joint; centre hinge holes at
  100 / 880 ± 16, 15.5 from the joint (door gap 1). Re-resolved with `_tmp-6595-bifold.mjs`, no warnings.
- Order: LS 7104969 left set + track 7104967 (top only, 675 long) — both listed as clearance / discontinued, check stock.

## Rev 3 (Mark 2026-10-31) — top cupboard split off

- WC-02 split into two cabinets (easier to fit):
  - **WC-02**, 711 × 1000 × 500 on the stone: the bi-fold appliance cupboard, 1 adj shelf, bottom still Removed. Its own top
    is now the track panel: carriage cups at 936 / 872.
  - **WC-14**, 711 × 390 × 500 over it (pos_z 1000): plain W2D, 2 PTO doors (room schedule). REVB 2 keeps the doors at 388
    with the 2 gap over the bi-fold doors, as before.
  - The fixed shelf is gone: the top of WC-02 + the bottom of WC-14 take its place.
- Applied in the DB + re-resolved (`_tmp-6595-split.mjs`), no warnings. The layout JSON carries the split (WC-14 = last entry).
