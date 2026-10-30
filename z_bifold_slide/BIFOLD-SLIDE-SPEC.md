# Sliding bi-fold doors — Finista BF-05

**Status:** spec written 2026-10-30. F1 built 2026-10-30 (tests pass), in-app check pending.

A pair of doors that folds and slides open. One door is hung on a gable. The other
(the **leading door**) rides a top track and, optionally, a bottom track. Used on:
- wall cabinets that sit on the bench (appliance cupboards, e.g. RHK6595 Parkedge);
- tall cabinets that go to the floor.

**Source:** Lincoln Sentry BR0124CH "Finista Sliding BF-05 Technical" (one page,
https://asset.duluxgroup.com.au/asset/3d4ecadb-3048-4fd5-ad6c-368fcf01a0e0/BR0124CH-Just-Released-Finista-Sliding-BF-05-Technical.pdf).

**Note:** on 2026-10-30, Lincoln Sentry's site marked both the door set and the track
**Clearance / Product discontinued**. Check stock before quoting.

## Products (Lincoln Sentry)

| Item | LS code | Catalogue | Notes |
|---|---|---|---|
| BF-05 2-door set **left** 12.5 kg | 7104969 | 2-113-50L | 1 upper roller, 1 bottom roller, 4 centre hinges (nylon, metal pin), centre hinge template |
| BF-05 2-door set **right** 12.5 kg | 7104970 | — | as left |
| BF-05 track 2 m white (top & bottom) | 7104967 | 2-113-502 | also silver 2-113-501 |
| BF-05/BF-06 centre hinge, aluminium, 2 per pack | 7104981 | 2-113-610 | the **35 cup** centre hinge option (replaces the kit's nylon ones; LS: for doors over 2 m). Mark, 2026-10-30 |

Gable hinges are not in the kit: we use our standard **Blum 110° soft close**.

**Limits** (sheet + LS page):
- door leaf 500 wide max, but Mark: **1200 inside width max for the 2 doors**;
- door height 2200 max;
- leaf weight 12.5 kg max;
- door thickness 25 max.

## Locked (Mark, 2026-10-30)

1. **Door gap** between the two doors = our middle reveal (GAPC). Nothing new.
2. **Overlay** up to 16–17 is fine. The sheet's 15 max is not enforced.
3. **Gable hinges** = standard Blum 110° soft close, normal hinge count rules.
4. **Hand** (which gable the doors hang on) is set on the RHS sidebar of a bi-fold
   cabinet.
5. **Top carriage**, on the leading door:
   - 2 × Ø35 × 11.5 cups, 64 apart vertically;
   - top cup centre 47.5 below the underside of the cabinet top (= 47.5 + top overlay
     from the door's top edge);
   - cup centre **22.5 in from the leading edge**;
   - cups only, no screw pilots.
6. **Bottom guide**, on the leading door: one Ø35 cup, centre 22.5 in from the leading
   edge. Three options per cabinet:
   - **Above bottom**: door can be flush; cup centre **26.5 above the top face** of the
     cabinet bottom. Track sits on the bottom.
   - **Below bottom**: cup centre **26.5 below the underside** of the cabinet bottom.
     The door must hang **at least 55** below the underside. Track is screwed under the
     bottom. On a tall cabinet: 15 clear under the door to the floor, kick face behind
     the mechanism.
   - **None**: top-hung only, no bottom cup, no bottom track.
7. **Below bottom does not move the door.** Mark sets the door; the app only warns
   when it hangs less than 55 below the cabinet bottom.
8. **Centre hinges**: two options per cabinet.
   - **Standard** (kit nylon hinges): a 32 × 32 square of **Ø3 × 10 deep** holes
     across the joint (2 holes on each door). Each door's column is **B\*** from its
     joint edge.
   - **Cup**: on **both** doors, a Ø35 × 12 cup with its centre 22.5 from the joint
     (edge 5 in), plus 2 × Ø10 × 11.5 dowel holes 52 apart (±26 vertically) at 28 from
     the joint (5.5 past the cup centre).
9. **Tracks are not drilled.** They are drawn, with a CAD dimension and detail in the
   Cabinet Edit modal.
10. **Folded diagram** (20 / 40 / 500 / 20–50) = clearance when open. Used for drawing
    the folded pack only.
10a. **Hand naming**: LS "left set" = doors hung on the left gable (Mark, 2026-10-30).
10b. **One handle**, on the leading door, at the joint edge (middle of the cabinet,
     where the doors meet); the outer door gets none (Mark, 2026-10-30).
10c. **B* = (32 − gap) ÷ 2** accepted for now; Mark adjusts after a test (2026-10-30).
11. **Width limit** 1200 inside for the 2 doors (warning above it).
12. **Library cabinets, not a switch on every cabinet** (Mark, 2026-10-30): **W2D/BF**
    (wall, e.g. an appliance cupboard on the bench) and **T2D/BF** (tall). The `/BF`
    modifier works like `/FL`: same carcass as W2D / T2D, with the bi-fold set on the
    cabinet. Both are copies of W2D / T2D, 900 wide, `rule_overrides.BIFOLD = 'L'`
    (`migration_bifold_library.sql`, applied). The RHS sidebar shows Hung on /
    Bottom guide / Centre hinge only on cabinets that have BIFOLD set; there is no
    tick box on other cabinets.

## Defaults (Claude, 2026-10-30 — Mark to overrule)

- **Storage**: rule_overrides switches, like the kick options:
  - `BIFOLD` = `'L' | 'R'` (absent = off). L = doors hang on the left gable, so the
    leading edge closes against the right gable.
  - `BIFOLD_BOTTOM` = `'above' | 'below' | 'none'` (default `above`).
  - `BIFOLD_CENTRE` = `'standard' | 'cup'` (default `standard`).

  They carry to the library like the kick switches. They are kept out of the rules
  editor.
- **Needs exactly 2 door zones side by side in one row**, or the warning
  `BIFOLD_NEEDS_2_DOORS` is shown and nothing changes.
- The **outer door** keeps its gable hinges (hinge_side = hand). The **leading door**
  gets no gable hinges.
- **Centre hinge heights** = the outer door's gable hinge heights (same count).
- **B\* = (32 − door gap) ÷ 2**, from the drawing: the 32 across is measured between
  the two doors' hole columns, across the joint. That gives 15 at a 2 gap. Computed
  from the real gap, no setting.
- **Hand to LS set**: L → 7104969 (left set), R → 7104970.
- **Track length** = inside width. Top always; bottom unless None. Bought by the 2 m
  length: ceil(total ÷ 2000) per cabinet.
- **Warnings**:
  - `BIFOLD_WIDTH` (> 1200 inside);
  - `BIFOLD_HEIGHT` (> 2200);
  - `BIFOLD_THICK` (> 25);
  - `BIFOLD_OVERLAY` (> 17);
  - `BIFOLD_BELOW_55` (below option, door hangs < 55 under the bottom).
- **Display layer**: new item `bifold_tracks` (Hardware group: plan, elevation, 3D).
  The cups and holes go through the existing `machining` / `hinges` items.

## Open questions

- None. B* to be checked on the first test door.

## Phases

| Phase | Scope | Status |
|---|---|---|
| F1 | Switches + RHS sidebar (tick, hand, bottom, centre). Resolver: carriage, bottom guide and centre hinge drills on the right doors (both centre options), no hinges on the leading door, warnings. CNC through seamDrillSync. Tests. | [x] built 2026-10-30, see F1 notes; in-app check pending |
| F2 | Hardware pick list / takeoff: LS set (L/R), tracks (2 m count), centre hinges (35 cup option: 7104981 packs of 2, ceil(hinges ÷ 2) per pair of doors). `hardware_accessories` rows. | [ ] |
| F3 | Cabinet Edit modal: tracks + carriage / guide outlines in Top / Elevation / Side; a Side detail with fixed dims (47.5, 64, 26.5, 22.5, 55, 15, 22.7 / 30.5); `bifold_tracks` layer item. | [~] 2026-10-30: tracks drawn in the modal views + cabinet sheets; CAD on the Side / Top tabs built (z_item_cad IC3a), so Mark draws the detail once on W2D/BF + T2D/BF and moves it to the cabinet code. Carriage / guide outlines not drawn. |
| F4 | 3D: tracks + fittings, folding open animation (trailing door pivots on the outer door's edge). Plan: folded-pack swing. | [~] tracks built 2026-10-30 (see F4 notes); fittings + fold animation + plan swing to do |
| F5 | Tutorial. | [ ] |

## F4 notes (2026-10-30)

- **No maker 3D model.** Lincoln Sentry publishes no CAD / GLB for BF-05, and a web
  search found none. The track is drawn in code instead (it is cut to each
  cabinet's width anyway):
  - `BifoldTrackModel`: `BIFOLD_TRACK_PROFILE` extruded gable to gable, white. The
    profile was shaped from Mark's LS photo (`z_accessories/models/Bi-fold Door/Top
    Track.png`, the lower track): a channel closed against the panel and open away
    from it, at the back (29–40 behind the doors); a foot flange along the open edge
    running forward to 22.7, toward the doors (Mark: first version faced the wrong
    way); two ribs on that side (2026-10-30);
  - Cabinet Edit modal Elevation / Top / Side: `BifoldTrackShapes` (`ResolvedViews`)
    draws the end profile at both ends, joined along the length;
  - `bifoldTracks()` in `resolveBifold.ts` gives the positions;
  - profile `BIFOLD_TRACK`: front 22.7 / back 40 behind the doors' back face,
    20 high, read off the BR0124CH drawing at scale.
- **Where the tracks go:**
  - Top: under the cabinet top, open down.
  - Bottom: the same track (LS sells it as "Top & Bottom"). On top of the bottom,
    open up ("above"), or under it, open down ("below"). None for "none".
  - Gable to gable.
- **Saved:** the resolved cabinet carries `bifold` (hand / bottom / centre), stored in
  `resolved_drawer_hw.bifold_cfg`. Without it (saved before) the bottom is drawn
  "above" until a re-resolve.
- **Drawn** in the Cabinet Edit modal 3D and the room 3D, on the `bifold` layer item
  (now shown in 3D by default).
- **To check:** profile height and depth against a real track.
- **Open doors** (Cabinet Edit modal 3D, 2026-10-31, `DoorPanel` `bifold` prop):
  - The outer door swings out on its gable hinges by θ.
  - The leading door turns the other way about its leading edge (the carriage). That
    edge slides along the top toward the hinge gable: span · (1 − cos θ), where
    span = both doors + the gap. So the joint comes out into the room.
  - Fully open is θ = acos(pack ÷ span), pack = 2 × door thickness + 4: the doors end
    as a ~40 pack standing out at the hinge gable, like the sheet's 20 / 40 diagram.
  - The outer door's hinge arms fold to the same θ.
  - Checked headless on a W2D/BF (mid-fold + fully open).
  - Plan-view folded swing still to do.

## F1 notes (2026-10-30)

- **Pure code**: `src/lib/resolver/resolveBifold.ts`.
  - `bifoldPair` runs right after the face module, before handles. It sets both
    doors' `hinge_side` to the hand and their `bifold_role`.
  - `resolveBifoldHoles` runs after the hinges. It writes `face_zones[].bifold_holes`
    (zone-local, back face) and the warnings.
  - `resolveHinges` skips the leading door.
- **Tests**: `src/lib/resolver/__tests__/bifoldSlide.test.ts`.
- **Top**: the carriage needs the cabinet top (`full_top`, else the front rail).
  With no top, the warning is `BIFOLD_NO_TOP`.
- **Bottom**: the guide uses `bottom`. A hole that falls off a door is dropped, with
  the warning `BIFOLD_HOLE_OFF_DOOR` (e.g. "below" on a door flush with the bottom).
- **Saved**: in `resolved_drawer_hw.bifold` (role + holes per door), next to
  `df_markers`. It is read back in the `canvasDB` load.
- **CNC**: `seamDrillSync` step 4c, into the door back face. 35 bores are `hinge_cup`;
  the rest are `bifold`.
- **Drawn**:
  - room elevation, through the `bifold` layer item (on the doors that are drawn);
  - Cabinet Edit modal elevation with Drilling on;
  - the 3D door bores in the modal.
- **Sidebar**: `CabinetPanel` → "Sliding Bi-fold": Hung on / Bottom guide / Centre
  hinge, shown only when BIFOLD is set (decision 12). The `BIFOLD*` keys carry to the
  library (`CARRIED_RULES`).
