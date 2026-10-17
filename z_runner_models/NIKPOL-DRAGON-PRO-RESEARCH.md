# Nikpol — DTC Dragon Pro research (NL 300–500, height 95–178)

Researched 2026-10-17. Read-only research; nothing written to the DB.

## Sources

- **[N-CAT]** Nikpol category "DTC Dragon Pro":
  https://www.nikpol.com.au/Category/dtc%20dragon%20pro_256. The full list came from the
  page's own AJAX endpoint `/ProductListing/FetchProductsForCategory?categoryName=dtc dragon pro_256&pageSize=200`,
  which returned 147 items across all 4 pages.
- **[N-PROD]** Nikpol product pages: `https://www.nikpol.com.au/<sku-lowercase>`. I checked these:
  HB015004AX, HB015004AXMG, HB025004AXMB, B013004AMB, HB015004GX. They all use the same
  feature text and spec block.
- **[N-PDF]** Nikpol "DTC Dragon Pro Tilt Adjust Installation Guide" (2026, 9 pages):
  https://www.nikpol.com.au/Uploads/Pdf/ItemPdf_253226063239_dragonprotiltinstallation220526.pdf.
  It is linked from https://www.nikpol.com.au/Services/Technicalinformation. Page 3 has the code
  grid, page 6 the profile and space drawings, and page 7 the drilling, cutting and screw positions.
  The drawings are vector art, so I rendered them to images and read the dimensions off them.
- A DTC certification (LGA report) PDF is also listed at
  `/Uploads/Pdf/ItemPdf_265624105602_DragonproLGAReport.pdf`. I didn't need it.
- I found no official DTC (dtc.com.cn) Dragon Pro data sheet. Everything below comes from Nikpol.

## What Nikpol stocks overall

- **Heights:** 80, 95, 127, 178, 209 and 238 mm. **There is no 159 mm.** Inside this brief's range
  (95–178) that leaves **95, 127 and 178**.
- **Lengths:** 300–600 mm in 50 mm steps. 80 mm comes in 500 only.

## 1. Products — drawer kits, NL 300–500 × H 95/127/178

### Specs common to every row

All of the following comes from [N-PROD] and [N-PDF] unless the source column says otherwise.

| Spec | Value |
|---|---|
| Load | 40 kg |
| Soft close | Yes (built-in soft close) |
| Full extension | Yes (synchronised full extension) |
| Adjustment | Up/down ±2 mm, left/right ±1.5 mm, tilt +0/−4 mm |
| Construction | Double-wall, 13 mm thin-line profile, no gallery rail |
| UOM | SET (sides + runners) |

**Price:** none shown. Every Nikpol product page says "Login To View Price", and the page's GA
`productPrice` placeholder is 99999.00. This is a gap.

**URL:** `https://www.nikpol.com.au/` + the SKU in lower case. Each SKU below was seen in the [N-CAT] listing.

### Product table

| # | SKU | Name as listed (all prefixed "DTC DRAGON PRO") | NL | H | Finish | Source / notes |
|---|---|---|---|---|---|---|
| 1 | HB013004AX | 95 X 300MM 40KG DRAWER KIT, TILT ADJUST (SILK WHITE) | 300 | 95 | Silk White | N-CAT, N-PDF |
| 2 | HB013504AX | 95 X 350MM … (SILK WHITE) | 350 | 95 | Silk White | N-CAT, N-PDF |
| 3 | HB014004AX | 95 X 400MM … (SILK WHITE) | 400 | 95 | Silk White | N-CAT, N-PDF |
| 4 | HB014504AX | 95 X 450MM … (SILK WHITE) | 450 | 95 | Silk White | N-CAT, N-PDF |
| 5 | HB015004AX | 95 X 500MM … (SILK WHITE) | 500 | 95 | Silk White | N-PROD (pallet qty 104) |
| 6 | HB023004AX | 127 X 300MM … (SILK WHITE) | 300 | 127 | Silk White | N-CAT, N-PDF |
| 7 | HB023504AX | 127 X 350MM … (SILK WHITE) | 350 | 127 | Silk White | N-CAT, N-PDF |
| 8 | HB024004AX | 127 X 400MM … (SILK WHITE) | 400 | 127 | Silk White | N-CAT, N-PDF |
| 9 | HB024504AX | 127 X 450MM … (SILK WHITE) | 450 | 127 | Silk White | N-CAT, N-PDF |
| 10 | HB025004AX | 127 X 500MM … (SILK WHITE) | 500 | 127 | Silk White | N-CAT, N-PDF |
| 11 | HB033004AX | 178 X 300MM … (SILK WHITE) | 300 | 178 | Silk White | N-CAT, N-PDF |
| 12 | HB033504AX | 178 X 350MM … (SILK WHITE) | 350 | 178 | Silk White | N-CAT, N-PDF |
| 13 | HB034004AX | 178 X 400MM … (SILK WHITE) | 400 | 178 | Silk White | N-CAT, N-PDF |
| 14 | HB034504AX | 178 X 450MM … (SILK WHITE) | 450 | 178 | Silk White | N-CAT, N-PDF |
| 15 | HB035004AX | 178 X 500MM … (SILK WHITE) | 500 | 178 | Silk White | N-CAT, N-PDF |
| 16 | HB013004AXMB | 95 X 300MM … (MATT BLACK) | 300 | 95 | Matt Black | N-CAT, N-PDF |
| 17 | B013004AMB | 95 X 300MM 40KGS DRAWER KIT (MATT BLACK) | 300 | 95 | Matt Black | N-PROD (pallet qty 160). **Not "tilt adjust"**: probably an older, non-tilt model. Not in the 2026 PDF grid. |
| 18 | HB013504AXMB | 95 X 350MM … (MATT BLACK) | 350 | 95 | Matt Black | N-CAT, N-PDF |
| 19 | HB014004AXMB | 95 X 400MM … (MATT BLACK) | 400 | 95 | Matt Black | N-CAT, N-PDF |
| 20 | HB014504AXMB | 95 X 450MM … (MATT BLACK) | 450 | 95 | Matt Black | N-CAT, N-PDF |
| 21 | HB015004AXMB | 95 X 500MM … (MATT BLACK) | 500 | 95 | Matt Black | N-CAT, N-PDF |
| 22 | HB023504AXMB | 127 X 350MM … (MATT BLACK) | 350 | 127 | Matt Black | N-CAT, N-PDF. No 127×300 in black. |
| 23 | HB024004AXMB | 127 X 400MM … (MATT BLACK) | 400 | 127 | Matt Black | N-CAT, N-PDF |
| 24 | HB024504AXMB | 127 X 450MM … (MATT BLACK) | 450 | 127 | Matt Black | N-CAT, N-PDF |
| 25 | HB025004AXMB | 127 X 500MM … (MATT BLACK) | 500 | 127 | Matt Black | N-PROD (pallet qty 81) |
| 26 | HB033504AXMB | 178 X 350MM … (MATT BLACK) | 350 | 178 | Matt Black | N-CAT, N-PDF. No 178×300 in black. |
| 27 | HB034004AXMB | 178 X 400MM … (MATT BLACK) | 400 | 178 | Matt Black | N-CAT, N-PDF |
| 28 | HB034504AXMB | 178 X 450MM … (MATT BLACK) | 450 | 178 | Matt Black | N-CAT, N-PDF |
| 29 | HB035004AXMB | 178 X 500MM … (MATT BLACK) | 500 | 178 | Matt Black | N-CAT, N-PDF |
| 30 | HB014004AXMG | 95 X 400MM … (MATT GREY) | 400 | 95 | Matt Grey | N-CAT, N-PDF. Grey starts at 400. |
| 31 | HB014504AXMG | 95 X 450MM … (MATT GREY) | 450 | 95 | Matt Grey | N-CAT, N-PDF |
| 32 | HB015004AXMG | 95 X 500MM … (MATT GREY) | 500 | 95 | Matt Grey | N-PROD (pallet qty 104) |
| 33 | HB024004AXMG | 127 X 400MM … (MATT GREY) | 400 | 127 | Matt Grey | N-CAT, N-PDF |
| 34 | HB024504AXMG | 127 X 450MM … (MATT GREY) | 450 | 127 | Matt Grey | N-CAT, N-PDF |
| 35 | HB025004AXMG | 127 X 500MM … (MATT GREY) | 500 | 127 | Matt Grey | N-CAT, N-PDF |
| 36 | HB034004AXMG | 178 X 400MM … (MATT GREY) | 400 | 178 | Matt Grey | N-CAT, N-PDF |
| 37 | HB034504AXMG | 178 X 450MM … (MATT GREY) | 450 | 178 | Matt Grey | N-CAT, N-PDF |
| 38 | HB035004AXMG | 178 X 500MM … (MATT GREY) | 500 | 178 | Matt Grey | N-CAT, N-PDF |

**How the SKUs are built ([N-PDF] page 3):** `HB0` + height digit + NL/10 + `04AX` + finish suffix.

| Part | Values |
|---|---|
| Height digit | 0 = 80, 1 = 95, 2 = 127, 3 = 178, 5 = 209, 4 = 238 |
| Finish suffix | none = Silk White, `MB` = Matt Black, `MG` = Matt Grey |

**Coverage, NL 300–500 × H 95/127/178:**

| Finish | Coverage |
|---|---|
| Silk White | Full 5 × 3 grid |
| Matt Black | Full grid except 127×300 and 178×300 (plus the extra non-tilt B013004AMB) |
| Matt Grey | NL 400–500 only |

### Runner-only SKUs in range (no drawer sides)

| SKU | Name as listed | NL | Load | Notes |
|---|---|---|---|---|
| HB013004GX | DTC DRAGON PRO PUSH TO OPEN 300MM DRAWER RUNNERS, TILT & DEPTH ADJUST (SLIDES ONLY) | 300 | 40 kg | Push to open, not soft close. Zinc. Full extension, undermount. Sync rod HBGG0FH01 recommended. |
| HB013504GX | … PUSH TO OPEN 350MM … | 350 | 40 kg | same |
| HB014004GX | … PUSH TO OPEN 400MM … | 400 | 40 kg | same |
| HB014504GX | … PUSH TO OPEN 450MM … | 450 | 40 kg | same |
| HB015004GX | … PUSH TO OPEN 500MM … | 500 | 40 kg | [N-PROD]: "SUITS HBGG0FH01 SYNC ROD AND HB**5004AX** DRAWER KITS". Box of 5, pallet 230. |
| HB015005H-1 | DTC DRAGON PRO SOFT CLOSE 500MM DRAWER RUNNERS, 50KG LOAD, TILT ADJUST (SLIDES ONLY) | 500 | 50 kg | Soft-close runner only. Comes in 500/550/600, so only 500 is in range. |

## 2. Drilling / mounting data (all from [N-PDF] pages 6–7)

The guide gives **one** set of data for all heights. Runner hole positions depend on NL only, and
the side clearances are the same for every height.

### 2a. Cabinet-side (gable) runner screw positions

Source: [N-PDF] p.7, "Screw position of the slides (mm)". All distances are measured from the
**cabinet front edge** to the reference hole of each bracket.

**Front bracket:** its "third hole" is at **37 mm** for soft-close runners. For push-to-open
runners the **second hole** is at 37 mm (p.7, "Fixing hole position for inner drawer").

**Rear bracket**, dimensioned as a chain from the 37 line:

| NL | Front bracket ref hole | Rear bracket ref hole | Extra bracket |
|---|---|---|---|
| 300 | 37 | 37 + 128 = **165** | — |
| 350 | 37 | 37 + 128 = **165** | — |
| 400 | 37 | 37 + 192 = **229** | — |
| 450 | 37 | 37 + 224 = **261** | — |
| 500 | 37 | 37 + 224 = **261** | — |
| 550 | 37 | 261 | — |
| 600 | 37 | 261 | 261 + 128 = 389 |

**Bracket hole pattern:**

- Each mounting block has two clusters of 3 round holes in the top row, with slotted and round
  holes below them.
- The drawing dimensions **9 mm between holes in a cluster** and **32 mm between the two clusters**,
  on both the front and rear blocks.
- The "37 | 32" chain at the top suggests the 32-pitch partner hole is at 37 + 32 = 69. That is my
  reading of the drawing; the guide does not state it.

**Gable hole height (vertical position):** no explicit hole-height dimension is given. The only
vertical runner dimension is in the "Space requirement in cabinet" view (p.6). It is the same for
95, 127 and 178:

- **min 33** is drawn from the top of the cabinet bottom panel up to the runner's lower screw line.
- My reading is that the runner's lower fixing is about 33 mm above whatever is below it.
- **This is not confirmed.** The label is "min33" and the guide doesn't say what it measures to.

### 2b. Depth / width formulas (p.7 "Installation dimensions" and "Cutting dimensions for 16mm chipboard")

| Item | Formula | Notes |
|---|---|---|
| Minimum internal cabinet depth (soft-close), LT | **NL + 3** | |
| Minimum internal cabinet depth (push-to-open), LT | **NL + 12** | Also: front set back by min 3 mm |
| Drawer bottom (16 mm chipboard) | width **LW − 75** (+1/−0) × depth **NL − 24** | LW = internal cabinet width |
| Drawer back (16 mm chipboard) | width **LW − 87** (+1/−0) | Height depends on profile, below |
| Inner drawer front panel B01021 (1100 mm stock) | cut to LW − 97 (per p.7 text; small print) | |
| Inner drawer cross rail M01078 | cut to LW − 74 (p.7, small print) | |
| PTO sync rod HBGG0FH01 | cut to LW − 106 | |

**Drawer back height by profile:**

| Profile | Back height |
|---|---|
| 80 | 69 |
| 95 | **84** |
| 127 | **116** |
| 178 | **167** |
| 209 | 198 |
| 238 | 228 |

**Side allowance:** the p.6 space view dimensions **37.5 mm** from the drawer-bottom edge to the
inside face of a **16 mm** gable. That is consistent with the bottom at LW − 75 (2 × 37.5). It
matches the existing DB value `runner_thickness = 37.5`, and `side_deduction 0` is fine if the
bottom is computed as LW − 2 × 37.5.

### 2c. Per-height clearances and front fixing (p.6)

| Profile | Min height space in cabinet | Front fixing holes (in drawer front) | Back bracket holes |
|---|---|---|---|
| 95 | **min 110** | 2 positions, 32 apart, lowest at 47.5 above the reference line; Ø2 pilot ×2 or Ø10; 12 mm from front's back face edge | 20 / 32 (from drawing; ref unclear) |
| 127 | **min 142** | 3 positions at 32 / 32 above 47.5 | 22 to first, then 32 / 32 |
| 178 | **min 192** | 32 / 64 / 32 above 47.5. Pairs 128 apart. | 39 to first, then 32 / 32 / 32 |

Other dimensions shown on every profile:

- Drawer bottom thickness: **16**.
- **22.8**: front-installation vertical, apparently from the bottom reference to the underside of
  the drawer bottom.
- **15.5**: horizontal, front-installation.
- **min 47.5**: front drilling, the lowest front hole above the front's bottom reference.
- **12**: front drilling, hole inset from the edge.

## 3. Gaps / not confirmed

1. **Prices.** Nikpol hides all prices behind a trade login ("Login To View Price"). I didn't use
   other retailers' prices (e.g. kitchenlibrary.au lists Dragon Pro around $33–45 AUD) because they
   aren't Nikpol's.
2. **Gable hole height above the cabinet floor / drawer bottom** is not dimensioned. "min33" is the
   only candidate, and what it measures to is my interpretation.
3. **Exact hole-by-hole positions within each runner bracket.** Only the reference hole (37 front;
   165/229/261 rear) and the 9 / 32 pitches are given. Absolute positions for the other holes are
   inferred, not stated.
4. **Rear bracket reference for 300 and 350.** Both show 128 from the 37 line, i.e. the same 165.
   That is what the drawing shows, but the 300 rear block is drawn without its own chain dimension.
5. **B013004AMB** (95×300 matt black, "40KGS DRAWER KIT", not tilt-adjust) is not in the 2026 PDF.
   It may be legacy or clearance stock, and its drilling may differ.
6. **No 159 mm height** exists in the Nikpol Dragon Pro range. Heights in range are 95 / 127 / 178 only.
7. **Runner thickness (37.5)** is taken from the 37.5 dimension on p.6. The runner's own body
   thickness and height aren't given separately.
8. **The fine print on p.7** (inner front panel LW − 97, cross rail LW − 74) was small and partly
   garbled in the PDF text layer, so check it against the PDF before relying on it.
