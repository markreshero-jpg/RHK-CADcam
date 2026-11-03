# Blum TANDEMBOX antaro: research notes (AU)

Researched 2026-10-20. All dimensions in mm. Every number below has a source tag. Tags:

- **[CAT24-p]**: Blum *Catalogue and technical manual 2024/2025 (en)*, printed page p. The online FlippingBook is at `https://publications.blum.com/2024/catalogue/en/<p>/`. A per-page PDF was downloaded here as `blum-catalogue-2024-page<p+4>.pdf`, because the PDF number is the printed page + 4.
- **[AU26-p]**: Blum Australia *TANDEMBOX Ordering and planning information* brochure, page p. File `blum-au-TANDEMBOX-ordering-planning-brochure.pdf` (18 MB, dated 09-01-2026). Listed on https://www.blum.com/au/en/products/boxsystems/tandembox-antaro/downloads-videos/ and downloaded from `https://www.blum.com/file/cme226320_ep_dok_baa?country=au&language=en`.
- **[MA513]**: Blum planning information MA-513/2ML (04.13), hosted by Lincoln Sentry: https://media.lincolnsentry.com.au/h3d/h25/9274862436382.pdf. This is an older document that uses the superseded profile series 558/559/556.
- **[WURTH]**: Blum product data sheets hosted by Würth: https://xcart.wurthlac.com/skin/common_files/files/specs/B578.450B-SpecSheet.pdf and https://xcart.wurthlac.com/skin/common_files/files/specs/B378M4002SA-GR-SpecSheet.pdf
- **[BLUM-AU]**: https://www.blum.com/au/en/products/boxsystems/tandembox-antaro/programme/
- **[LS]**: lincolnsentry.com.au product pages. These were seen only as search-result titles and snippets, because the site returns 404 to automated fetches.

Values marked **INTERPRETED** were read from a Blum drawing where the label is clear but the reference line had to be worked out from the drawing. Values marked **UNVERIFIED** could not be confirmed from a source.

---

## 1. Cabinet profiles (runners)

The current profiles have integrated BLUMOTION. The same profile part number serves BLUMOTION, SERVO-DRIVE and TIP-ON BLUMOTION. The TIP-ON BLUMOTION unit is a separate add-on set. [AU26-6] states "Suitable for SERVO-DRIVE and TIP-ON BLUMOTION". [CAT24-400] lists the same 578/576 numbers under "Version TIP-ON BLUMOTION".

| NL | 30 kg (series 578) | 65 kg (series 576) | In AU range? [AU26] | Min internal depth |
|---|---|---|---|---|
| 270 | 578.2701M | – | yes | NL+3 = 273 |
| 300 | 578.3001M | – | **no** (global only) | 303 |
| 350 | 578.3501M | – | yes | 353 |
| 400 | 578.4001M | – | yes | 403 |
| 450 | 578.4501M | 576.4501M | yes | 453 |
| 500 | 578.5001M | 576.5001M | yes | 503 |
| 550 | 578.5501M | 576.5501M | yes | 553 |
| 600 | 578.6001M | 576.6001M | **no** (global only) | 603 |
| 650 | – | 576.6501M | yes | 653 |

Sources: global part numbers come from [CAT24-296], [CAT24-400] and [CAT24-334]. The AU subset comes from [AU26-8,10,12] (30 kg: 270, 350–550; 65 kg: 450, 500, 550, 650). [BLUM-AU] gives "30 kg: 270–550, 65 kg: 450–650".

- **Min internal cabinet depth = NL + 3.** The "Space requirement" graphic labels the depth "NL + 3" ([CAT24-294], [AU26-6]). [WURTH] for 578.4501B gives a minimum internal cabinet depth of 453, which matches. Inner drawers with TIP-ON BLUMOTION need **NL + 12** ([CAT24-401]).
- **Load classes are 30 kg and 65 kg** (dynamic). There is no 50 kg class in the current antaro range. The old 559 (50 kg) series appears only in the 2013 document [MA513].
- **"B" vs "M" suffix.** Lincoln Sentry still lists older `578.xxx1B` / `576.xxx1B` (BLUMOTION) as well as `…M`. Their titles describe `…M` as "TIP-ON WITH BLUMOTION" [LS: https://www.lincolnsentry.com.au/tandem-box-65kg-runner-576-5001m-tip-on-with-blumotion-500nl/p/7100603, https://lincolnsentry.com.au/tandembox-runner-tipon-blumotion-576-6501m-650nl-65kg-left-right/p/7112634]. Some B items are flagged discontinued (576.5001B). Order **…M**, the current Blum number.
- **Profile geometry** [WURTH 578.4501B]: profile length 447 (= NL − 3), drawer length 440 (= NL − 10). Two more values, 43.6 and 26.6, are probably the shank (vertical flange) height and the profile width. **UNVERIFIED:** the columns in the extracted data sheet are scrambled, so the order is inferred.
- **TIP-ON BLUMOTION sets** [CAT24-400]:

  | NL | Unit | Profile | Pull-out weight | Part no. |
  |---|---|---|---|---|
  | 270–300 | S0 | 30 kg | ≤ 10 kg | T60B3030 |
  | 270–300 | S1 | 30 kg | > 10–20 kg | T60B3130 |
  | 350–600 | L1 | 30 kg | ≤ 20 kg | T60B3330 |
  | 350–600 | L3 | 30 kg | 15–30 kg | T60B3530 |
  | 450–650 | L5 | 65 kg | > 30–65 kg | T60B3560 |

  The AU brochure lists S0/S1 for NL 270 only [AU26-49].
- **Synchronisation:**
  - LW ≥ 287 needs linkage T60.1125W, cut to LW − 240, plus 2× T60.000D adapters.
  - LW 238–286 needs T60.300D, cut to LW − 214.
  - Minimum front gap with TIP-ON is 2.5.
  - Sources: [CAT24-400/401].

## 2. Drawer sides (drawer side sets, L+R)

| Height code | Side height | Space requirement (incl. 3 top clearance) | Side set part no. pattern | NLs available |
|---|---|---|---|---|
| N | **68.5** [CAT24-294] (AU brochure prints **67** [AU26-6]) | 82.5 | 378N`LLL`2SA | 400, 450, 500, 550 |
| M | **83.6** [CAT24-296], [AU26-8], [WURTH] | 98.5 | 378M`LLL`2SA | 270–650 (AU: 270, 350, 400, 450, 500, 550, 650) |
| K | **115.6** [CAT24-300] | 130.5 | 378K`LLL`2SA | 270–650. **Not in the AU brochure** [AU26]; [BLUM-AU] lists N, M, C, D. K in AU is **UNVERIFIED**. |
| C (gallery) | M side 83.6 + 1 longside gallery rail per side | 192 | 378M… + ZRG.`xxx`RSIC | as M |
| D (gallery) | M side 83.6 + gallery rail, higher position | 224 | 378M… + ZRG.`xxx`RSIC | as M |
| D with K side | K side 115.6 + gallery rail | 224 | 378K… + ZRG… | global only [CAT24-308] |

Part numbers use `LLL` = NL/10 with a trailing 2 (e.g. NL 500 → 378M5002SA). The full lists:

- 378N4002SA, 378N4502SA, 378N5002SA, 378N5502SA
- 378M2702SA, 378M3002SA, 378M3502SA, 378M4002SA, 378M4502SA, 378M5002SA, 378M5502SA, 378M6002SA, 378M6502SA
- 378K2702SA through 378K6502SA in the same NL pattern

Sources: [CAT24-294..318], [AU26]. Lincoln Sentry sells these as "378M5002SA-SW" etc. [LS].

**Longside gallery rails (C/D), NL → part:**

| NL | Part no. |
|---|---|
| 270 | ZRG.207RSIC |
| 300 | ZRG.237RSIC (global only) |
| 350 | ZRG.287RSIC |
| 400 | ZRG.337RSIC |
| 450 | ZRG.387RSIC |
| 500 | ZRG.437RSIC |
| 550 | ZRG.487RSIC |
| 600 | ZRG.537RSIC (global only) |
| 650 | ZRG.587RSIC |

The rule is part = NL − 63. Sources: [AU26-14, 16], and the Lincoln Sentry titles "ZRG.437RSIC 500NL" and "ZRG.387RSIC 450NL".

Other components:

- **Cross gallery (inner drawers / pull-outs):** ZRG.1046Z, cut to LW − 122.
- **Front piece without groove (inner):** Z31L1036A, cut to LW − 132 [AU26-10, 14].
- **Metal design element for D:** Lincoln Sentry sells "TANDEMBOX antaro Metal Element Drawer Sides D Height 450NL" (supplier code Z37A417D SE, aluminium, fills the gap between the side and the gallery rail). Seen only via search snippet: https://www.lincolnsentry.com.au/blum-tandembox-antaro-metal-element-drawer-sides-d-height-450nl-pair-silk-white/p/7100663. **UNVERIFIED** against Blum.
- **BOXCAP / BOXSIDE** are **not antaro**. They are TANDEMBOX plus and LEGRABOX design elements. Antaro uses gallery rails for C/D.

**Colours:**

- Global antaro: Silk white (SW) and RAL 9006 white aluminium (R9006), plus nylon parts in white grey (WGR) [CAT24-293].
- **Australia: silk white only** [BLUM-AU], [AU26-5].
- Orion grey, carbon black and stainless steel are LEGRABOX colours, not antaro.

## 3. Drawer-box construction (16 mm chipboard)

Sources: [CAT24-295,297,301,305,309,313], [AU26-7,9,11,13,17,21], [MA513-3].

| Part | Size |
|---|---|
| **Base (bottom)** width | **LW − 75** |
| Base length, chipboard back | **NL − 24** |
| Base length, steel back | **NL − 22** |
| **Chipboard back** width | **LW − 87** |
| Back height, N | 69 |
| Back height, M | 84 |
| Back height, K | 116 |
| Back height, C | 167 |
| Back height, D | 199 |
| Back height, B (accessory back fixing Z30B000S.04) | 135 |

- **Material is 16 mm chipboard** for both base and back ("Cutting – 16 mm chipboard"). [WURTH] gives base thickness 16. No 19 mm option is shown.
- LW is the internal cabinet width between the gables. **Base edge to gable inner face = 37.5 each side**, i.e. 75/2. [WURTH] calls this "install. dim. drawer side (inn. cabinet to outer base edge) 37.5".
- **Base fixing:** [WURTH] gives "prong connection or screw-on". The section drawings show a chipboard screw driven up through the drawer-side flange into the base.
- **Back fixing:** chipboard back fixing brackets left/right are screwed to the face of the back:

  | Height | Bracket |
  |---|---|
  | N | Z30N000S.04 |
  | M | Z30M000S.04 |
  | K | Z30K000S |
  | C | Z30C000S |
  | D | Z30D000SL |

  Screw holes in the back (from the back's top edge, 9 in from the back panel's end; **INTERPRETED**). Sources: [CAT24-295..313], [AU26]:

  | Height | Hole positions down from top |
  |---|---|
  | N | 22, 38 |
  | M | 20, 52 |
  | K | 22, 54, 86 |
  | C | 39, 71, 103, 135 |
  | D | 8, 40, 104, 136, 168 |

- **Steel back** is an alternative. It changes the base length to NL − 22.
- **Cutlery-insert inner geometry** [CAT24-728]: insert length = NL − 26; width BB = LW − 2A (see §6).

## 4. Cabinet (gable) drilling for the cabinet profile

The fixing-position chart is in [CAT24-334] (`blum-catalogue-2024-page0338.pdf`) and [AU26-47].

- Screw types:
  - **A** = chipboard screw Ø4 × 15
  - **B** = system screw Ø6 × 14.5, Blum 661.1450.HG (into Ø5 System-32 holes; **UNVERIFIED** hole Ø/depth)
- Chart legend [AU26-47]:
  - half-filled = A or B
  - white = A only
  - black = B only
  - `**` = optional, for greater stability (can be a chipboard screw)
- Positions are along the profile from the front. The 37 / 133 / 165 / 229 / 261 / 293 / 357 / 453 / 517 / 549 positions are all 37 + n·32, which is Blum's System-32 front line at 37 from the cabinet front edge. **INTERPRETED:** distances are measured from the cabinet front edge, with the profile front flush with the gable front for overlay drawers. No text explicitly states the set-back. For inner drawers, [CAT24-401] shows alternative screw positions at 42 and 37.

**578 – 30 kg** (B = system-screw / System-32 positions; A-only = extra chipboard-screw positions):

| NL | Front | Rear (A/B) | Extra A-only |
|---|---|---|---|
| 270 | 19**, 37 | 133 | 115 |
| 300, 350 | 19**, 37 | 165 | 133 |
| 400 | 19**, 37 | 229 | 165 |
| 450 | 19**, 37 | 261 | 165 |
| 500, 550, 600 | 19**, 37 | 261 | 293 |

**576 – 65 kg:**

| NL | Front | A/B | B only | A only | Optional ** |
|---|---|---|---|---|---|
| 450 | 19*, 37 | 115, 165, 261 | – | 28 | 357 |
| 500–550 | 19*, 37 | 115, 261 | 293 | 28 | 453 |
| 600 | 19*, 37 | 115, 261 | 293 | 28 | 517 |
| 650 | 19*, 37 | 115, 261 | 293 | 28 | 549 |

`*` = can be replaced with a chipboard screw.

**Vertical position:**

- Profile screw line is **min 33 above the top of the cabinet bottom** (or the object below) for a standard drawer. It is **min 36** with TIP-ON BLUMOTION. Sources: [CAT24-295], [AU26-7], [CAT24-401].
- Underside of the drawer base is **min 9** above the same reference [AU26-7] (**INTERPRETED** reference: base underside).
- Top of the side is 79.5 (N), 95.5 (M) and 127.5 (K) above that reference. The top clearance above the screw line is min 49.5 (N), 65.5 (M), 97.5 (K), 159 (C) and 191 (D). Each equals side top − 33 + 3.

**Side clearance:**

- The base is 37.5 from each gable (LW − 75 total).
- Built-in tolerance compensation is ±1.5 per side [CAT24-726].
- Height adjustment is ±2 [WURTH].
- Runner thickness alone is not published; the profile width is 26.6 per [WURTH] (**UNVERIFIED**).

## 5. Front fixing (into the back of the drawer front)

Sources: [CAT24-295..313], [AU26-7..21], [MA513-2].

- **Brackets:**
  - Knock-in: 2× ZSF.36A2
  - INSERTA: 2× ZSF.39A2
  - Screw-on: 2× ZSF.35A2
  - For aluminium-frame fronts: screw-on ZSF.35A2 + ZRF.2210 adapter
- **Holes for INSERTA / knock-in: Ø10 (+0.2 / −0.1), 12 deep.**
- **Horizontal:** hole centre is **15.5 inboard of the gable inner face**. That puts it **FA + 15.5** from the front's side edge, where FA = front overlay onto the gable.
- **Vertical:** measured up from the **underside of the drawer base** (**INTERPRETED**: in the screw-on drawing that line sits 9 above the cabinet bottom). The front's bottom edge must be at least at that line, which is the "min" value in the INSERTA drawing.

| Height | Lower hole | Upper hole | Gallery / extra hole |
|---|---|---|---|
| N | 32.5 | 64.5 (+32) | – |
| M | 47.5 | 79.5 | – |
| K | 47.5 | 79.5 | 111.5 (+32; K side set includes 2× positioning dowel) |
| C | 47.5 | 79.5 | 175.5 (+96, gallery head) |
| D | 47.5 | 79.5 | 207.5 (+128, gallery head) |

- **Inner drawers** use a front fixing *set* instead of brackets:
  - M: ZIF.71M0
  - K: ZIF.71K0
  - C: ZIF.76C0
  - D: ZIF.76D0

  The front is an aluminium front piece cut to LW − 132. Optional handle ZIF.80M5 or handle-and-latch ZIF.80M7. Latch drilling: Ø25, min 17 from the top, centred; X + 47 / 61.5 per [AU26-12] and [MA513-3]. Inner-drawer space requirement is M 106 and K 136.5; inner C/D are 192/224 [CAT24-292].

## 6. Geometry for a 3D / parametric model

- Side heights: N 68.5 (or 67 per AU26), M 83.6, K 115.6. C/D add a gallery rail. Side lengths ≈ NL. **UNVERIFIED:** the exact side length; drawer length is 440 for NL 450 (NL − 10) per [WURTH].
- **Inner face profile of the drawer side** [CAT24-728], `blum-catalogue-2024-page0732-tandembox-inner-profile.pdf`. A = horizontal distance from the gable inner face; H = height above the top of the base.
  - At H = 0, A = 42. That is 4.5 inboard of the base edge at 37.5, because the side's foot laps over the base.
  - From H = 0 to about H = 14: a 55.8° flank, then an R10.5 fillet up to A ≈ 30.5 at H ≈ 14. There is a 1.25 step.
  - Above H = 14: a straight face leaning in.

    | Side | Angle from vertical | A at H = 60 |
    |---|---|---|
    | N | 12.9° | ≈ 20 |
    | M | 9.3° | ≈ 23 |
    | K | 5.8° | ≈ 26 |

  - That is enough for an extrusion outline of the inner face.
  - **UNVERIFIED:** the outer face (towards the gable) and the wall thickness. The section drawings show a double-wall side roughly 11–15 thick at the top, tapering out to about 37.5 at the bottom, but no dimension is given.
- Runner profile (per [WURTH], **UNVERIFIED** mapping): length NL − 3, shank height 43.6, width 26.6.
- **CAD downloads:** none are linked on the antaro pages. Blum offers 3D CAD in "all the usual formats", 2D drawings and CAM macros via:
  - the CAD/CAM Data Service: https://e-services.blum.com/ (described at https://www.blum.com/au/en/services/industrial-production/cad-cam-dataservice/)
  - the Product Configurator: https://www.blum.com/esp-productconfigurator
  - myBlum: https://my.blum.com/#/products

  Access appears to need a login (**UNVERIFIED**). Exact formats (STEP / DWG / glTF) are **UNVERIFIED**, and no GLB is offered.

## 7. Minimum heights / bottom-drawer position

The space requirement per drawer (min vertical space, cabinet bottom or lower object up to the next object) is [CAT24-292], [AU26]:

| Type | Min space |
|---|---|
| N | 82.5 |
| M | 98.5 |
| K | 130.5 |
| C | 192 |
| D | 224 |
| Inner M | 106 (103 with easy access from above; 73 with the ZIF.80M7 handle) |
| Inner K | 136.5 |

- **Bottom drawer:** profile screw line ≥ 33 above the top of the cabinet bottom (≥ 36 with TIP-ON). Drawer base underside ≥ 9 above it.
- Minimum front heights are not stated directly. **INTERPRETED:** the front must cover from the base underside up past the top hole. Lower-hole-to-front-bottom is min 32.5 (N) or 47.5 (M/K/C/D) ([CAT24-295] "Drilling distances – front", min dims).
- Minimum front gap is 2.5 with TIP-ON [CAT24-401]. For other gaps, see the per-cabinet "Front overlay | minimum gap" page [CAT24-725].

## Gaps / not verified

1. **N side height:** 68.5 in [CAT24-294] vs 67 in [AU26-6].
2. **K height in Australia:** absent from the AU brochure and from the AU web page height list. Ask Blum AU or Lincoln Sentry.
3. **Front set-back of the cabinet profile:** inferred flush with the gable front, from the System-32 37 line. No explicit statement found.
4. **Vertical reference of the front-fixing hole heights:** read from drawings as the drawer base underside. Confirm with one physical sample.
5. **System-screw hole size:** Ø5 System-32 is assumed. Neither the hole size for 661.1450.HG nor the gable hole depth was found.
6. **Outer side profile, wall thickness and runner cross-section:** no dimensions. The [WURTH] values (43.6 / 26.6) have an uncertain mapping.
7. **CAD/3D download:** exists via Blum E-SERVICES / myBlum (login likely). Formats not confirmed; no GLB.
8. **Lincoln Sentry pages** could not be fetched (404 to bots). Their AU part availability came only from search snippets.

## Downloaded files (this folder)

**Blum catalogue 2024/2025:**

| File | Printed page(s) | Content |
|---|---|---|
| `blum-catalogue-2024-page0294.pdf` … `page0338.pdf` | 290–334 | Whole TANDEMBOX antaro chapter: overview, N/M/K/C/D order and planning pages, sink, SPACE TOWER, narrow cabinets, accessories, profile fixing positions (page0338) |
| `blum-catalogue-2024-page0404-tipon-tandembox.pdf` | 400 | TIP-ON BLUMOTION for TANDEMBOX, ordering |
| `blum-catalogue-2024-page0405-tipon-tandembox.pdf` | 401 | TIP-ON BLUMOTION for TANDEMBOX, planning |
| `blum-catalogue-2024-page0729-box-dimensions.pdf` | 725 | Box dimensions, definitions |
| `blum-catalogue-2024-page0730-tolerance.pdf` | 726 | Tolerance compensation |
| `blum-catalogue-2024-page0732-tandembox-inner-profile.pdf` | 728 | Inner side profile (A vs H) |

**Blum Australia (from the antaro downloads page):**

- `blum-au-TANDEMBOX-ordering-planning-brochure.pdf`: the main AU source.
- `blum-au-TANDEMBOX-drawer-installation-instructions.pdf` (me145106)
- `blum-au-TANDEMBOX-installation-instructions.pdf` (cme223325)
- `blum-au-TANDEMBOX-standard-applications.pdf` (cme222960)

**Other:**

- `blum-cme108331-ordering-planning-en.pdf`: older global antaro ordering and planning PDF, from `https://d2.blum.com/services/BEC003/cme108331_ep_dok_bau_$sen_$aof_$v1.pdf`.
- `lincolnsentry-9274862436382.pdf`: MA-513 N/M/K planning info (2013, old 558/559/556 profiles).
- `lincolnsentry-9274865385502.pdf`: antaro C/D high-fronted pull-out planning (older).
- `wurth-B578.450B-specsheet.pdf`, `wurth-B378M4002SA-GR-specsheet.pdf`: Blum data sheets.
