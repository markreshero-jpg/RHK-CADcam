# Sliding robe doors — Häfele Slider SC

**Status:** spec written 2026-11-04. S1, S2, S4, S5 built and S3 3D built (tests pass); in-app check pending. Next: S3 plan / elevation, S6 tutorial.

Soft close, bottom-running sliding robe doors in a **recess** (wall to wall, no
carcass). Board panels in aluminium profiles, on a top guide track and a bottom
running rail. Doors up to 50 kg.

**Source:** Häfele AU brochure AA01SLIDERSC "Slider SC Soft Close Sliding System",
04.2026, 8 pages
(https://www.hafele.com.au/hap-live/web/WFS/Haefele-HAA-Site/en_AU/-/AUD/Static-View/pdfcatalog/en_AU/catalogs/index.php?catalog=AA01SLIDERSC).
Page images: `catalogs/catalogs/AA01SLIDERSC/large/bk_1.jpg` … `bk_8.jpg` under the
same base. No install instructions were found online. The QR code on page 2 is too
low-res in the viewer to read.

## Locked (Mark, 2026-11-04)

1. **Library items** (like `/BF`), not a switch on every cabinet.
2. **Recess unit, no carcass.** Only the doors, profiles and tracks are made. Width =
   inside cupboard width (ICW, wall to wall); height = inside height (IH).
3. **All three door sets:** 2 door (double track), 3 door on a double track, and
   3 door on the triple track.
4. **All three vertical profiles** are selectable: handle H (18 board), slimline stile
   (18 board), 16 mm handle (403.93.953, silver only).
5. **Door colour** follows the cabinet / room / job door colour (normal door style and
   colour range cascade). The panels are door parts that go through the optimiser.
6. **Not modelled:** fitting set (rollers, guides, soft close) and wedge profile.
7. **Panel deductions** are derived from the drawings (Claude), to be checked on the
   first door.

## Derived from the brochure (Claude, 2026-11-04 — check on the first door)

- **The page 6 "Door Width" formulas are the board panel width.** Adding each vertical
  profile's reach past the board edge gives exactly the 60 overlap (X) at each joint:

  | Stile | Reach past board edge | 2 door panel | 3 door panel |
  |---|---|---|---|
  | Handle H | 37.8 (53.3 flange − 15.5 over the board) | (ICW − 92) ÷ 2 | (ICW − 108) ÷ 3 |
  | Slimline | 3.5 | (ICW + 60 − 14) ÷ 2 | (ICW + 120 − 21) ÷ 3 |
  | 16 mm handle | 21 | (ICW − 24) ÷ 2 | (ICW − 6) ÷ 3 |

- **Door height = IH − 55.** Taken as the panel height.
- **Slimline:** the page 3 note says to put a 6 spacer under the rollers and the guide,
  so the slimline panel is **IH − 67** (12 shorter). This is a guess.
- **Track pitch 39:** rail rib pairs 39 apart; guide channels 79 ÷ 2 and 117 ÷ 3.
  The front door centre sits **34.5** back from the rail lip face.
- **Door order** (page 6 diagrams, front = bottom of the diagram):
  - 2 door: left at the front.
  - 3 door, double track: outer two at the front, middle at the back.
  - Triple: stepped back from left to right.
- **Horizontal stile** (944.02.7xx / 403.90.017) top and bottom of every panel, at the
  panel width. This applies to all three vertical profiles: "1 horizontal door profile
  per door" in the sets, and the exploded view shows G top and bottom.
- **Profile end shapes** are in `sliderSC.ts`. The overall sizes are the dimensioned
  ones; the small details are approximate, because the brochure sections are not to
  scale.

## Defaults (Claude — Mark to overrule)

- **Storage:** `rule_overrides` switches (like BIFOLD), carried to the library:
  - `SLIDER` = `'2' | '3' | '3T'` (absent = not a slider);
  - `SLIDER_STILE` = `'handle' | 'slimline' | 'handle16'` (default `handle`);
  - `SLIDER_FINISH` = `'white' | 'silver' | 'black'` (default `silver`);
  - `SLIDER_RAIL` = `'lip' | 'plain'` (default `lip`; triple is lip only).
- **Library rows:** face-only items (`has_carcass = false`, `has_face = true`, no
  internal, no kick), tall class, 1 row × 2 or 3 door columns. Codes `T2D/SLD`,
  `T3D/SLD`, `T3D/SLD3` (`/SC` is taken by scribe).
- **No hinges, no handles** on the doors. The stile is the handle.
- **No edge banding** on the panels: the edges are inside the aluminium (Mark, 2026-11-04).
- **Profiles on the takeoff** as `accessory` parts with a cut length, through
  `hardware_accessories` rows (Häfele, `supplier_code` = cat. no.). The bars to buy
  are packed from the stock lengths (`sliderBuyList`, 3 kerf).
- **Warnings:**
  - `SLIDER_DOOR_HEIGHT` (> 2750);
  - `SLIDER_DOOR_WIDTH` (outside 900–1350);
  - `SLIDER_BOARD_THICK`;
  - `SLIDER_FINISH_NA` (16 handle not in silver);
  - `SLIDER_TOO_LONG` (a cut longer than the longest bar).

## S2 notes (2026-11-04)

- Cabinet coords: the opening front is the item's front (z = DZ); the doors sit
  just behind it, the interior goes behind them. DZ = recess depth (600 default).
- Door (stile) bottom 15 above the rail base (8 ribs + roller clearance — a guess);
  the slimline panel 6 higher still (spacer). Guide fixed to the head (y = IH).
- Rail base at y = 0; the lip rail's 19 lip hangs below that (open question).

## Open questions

- Robe interior cabinets placed in the same recess overlap the item in plan —
  check placement / collisions when it is first used.

- Slimline panel height: IH − 67 (spacers), or IH − 55?
- Rail with lip: the 19 lip hangs down the front edge, so the rail sits on something
  (an 18 floor strip / plinth?). What sits under it in a recess, and is IH measured
  from the floor or from that?
- 2 door: is the left door at the front OK, or should it be a sidebar choice?
- Default finish: silver?
- Takeoff: list loose bars, or the 944.02 door set code when a set fits?

## Phases

| Phase | Scope | Status |
|---|---|---|
| S1 | `src/lib/resolver/sliderSC.ts`: profiles, catalogue, panel sizes, door layout, cut list, bar packing, warnings, track sections. Tests `__tests__/sliderSC.test.ts`. | [x] 2026-11-04 |
| S2 | Resolver: `resolveSlider` after resolveHandles. Rewrites the door zones (panel size, X, Y, Z per track), no hinges or handles, warnings. The aluminium is **not** parts: `ResolvedCabinet.slider` (saved as `resolved_drawer_hw.slider_cfg`) + `sliderProfiles()` give the pieces to draw. RHS sidebar section (profile / finish / rail; the door set is fixed by the item) shown only when SLIDER is set. | [x] 2026-11-04 |
| S3 | Drawing: 3D tracks and profiles (extruded sections, finish colour), room and modal elevation, plan (doors stacked on their tracks). Display layer item `slider` (Hardware group). | [~] 2026-11-04: 3D (`SliderProfileModel`); plan + Plan View print, room elevation + print, Cabinet Edit modal Elevation / Top / Side (`SliderShapesSVG`, outlines from `sliderPieceOutline`); no door swings in plan. Checked on the Hafele Test Slider Job. Slide-open in 3D, shop drawing sheets (CabinetSheetSVG) to do. |
| S4 | Takeoff: a "Sliding door profiles" group in `takeoff/hardware.ts`, one line per bar to buy (profile, finish, stock length, Häfele cat. no.), the cut lengths on it. Straight from `sliderSC.ts`, no `hardware_accessories` rows. | [x] 2026-11-04 |
| S5 | Library rows `T2D/SLD` (2400), `T3D/SLD` (3000), `T3D/SLD3` (3600), 2400 high, 600 deep, Tall › Cabinets (`migration_slider_library.sql`, applied 2026-11-04). Placement filling the recess gap / height: to do (set W/H by hand for now). | [~] |
| S6 | Tutorial. | [ ] |
