# Lift systems (Blum Aventos) — Spec & Phase Tracker

> **RESUME HERE** → 2026-11-14 Mark OK'd the library shape (own **Lift systems** tab, Lincoln Sentry codes,
> GLBs later). Power factor rules + LS seed codes collected below. **Nothing built.** Next: LS1 (table + tab +
> seed). Still open: Q1 / Q3 below, LS stock check on the "discontinued" flags, missing codes.
>
> Library cupboard **W1LU** exists (wall, one top-hinged lift-up flap, no hinges, TIP-ON push to open,
> 375 x 600 x 300 default) — RHK6468 butler's pantry.

## Done

- `cabinet_definitions` **W1LU** (cloned from W1D): face zone `door`, `hinge_side: 'top'`, `hinges: []`.
  Stack two for a "split" overhead: the upper hangs off the room's overhead top line, the lower sets its own
  underside with rule `WALLZ` (RHK6468: 1995-2370 over 1620-1995, under panel below).

## Locked decisions (2026-11-14, Mark)

- **L1 Own library tab** — "Lift systems" in the Materials & Hardware library (beside Hinges / Handles /
  Slides / Accessories), table `hardware_lift_systems`. Not an Accessories category: it has its own sizing
  fields, is picked per front, and drills the carcass + front.
- **L2 Supplier codes, not Blum codes** — we order from **Lincoln Sentry**, so the row's `code` is the LS
  product code (7-digit, e.g. 7102414) and the hardware list / order sheet print LS codes. The Blum code is
  kept in a secondary `maker_code` column (it's what Blum's drilling / assembly docs are indexed by).
- **L3 GLB per row** — `model_url` (same bucket + upload flow as Handles / Accessories). Model the arm as a
  separate node so 3D can show the flap open and closed. Graphics come after the data.
- **L4 Pick by power factor** — the resolver works out LF and picks the set (rules below), warns when
  out of range or near a limit.

## Blum sizing rules (Blum catalogue 2024-25)

- **Power factor LF = cabinet height KH (mm) × front weight FG (kg), handle weight counted twice.**
  Front weight = board density × front area (+ handle ×2). Blum's reference front weights per board
  type are on catalogue p.716 (not read yet).
- Overlapping ranges → use the stronger set. Near a limit → Blum says trial-fit (we warn).
- A **third mechanism** raises LF by 50% (HK-S, HF; wide flaps).
- **HF (bi-fold)**: FG = both fronts + handles. Asymmetrical fronts: use theoretical height
  TKH = upper front height × 2 + gaps; the taller front goes on top.

| Family | Cabinet height | Width | Notes |
|---|---|---|---|
| HK-XS | 240–600 | — | needs hinges: 3 from KB 900 / LF 1800, 4 from KB 1200 / LF 2700 (sprung hinges std, unsprung with TIP-ON) |
| HK-S | ≤ 600 | — | no hinges; for small flaps (above fridge / larder) |
| HK top | 205–600 | ≤ 1800 | no hinges; **max front 18 kg on two mechanisms** |
| HF top | 480–1200 | ≤ 1800 | bi-fold, 2 fronts + centre hinges; lever arm set by cabinet height |

Worked example (2pac MDF 18 ≈ 750 kg/m³): 375 × 600 flap ≈ 3.0 kg → LF ≈ 1100 (HK-XS, HK-S or HK top
small all fit). RHK6468 375 × 1377 flap ≈ 7 kg → LF ≈ 2600 → HK-S / HK-XS out of range, **HK top 930–2800**.

## Seed — Lincoln Sentry codes (looked up 2026-11-14)

LS code / Blum code / LF range. "Chip" = chipboard screw with positioning system (no pre-drill);
"sys" = pre-mounted system screw (needs pre-drilled holes). Prices are retail inc GST off the LS site.

**⚠ Most of these LS pages carry a "Product Discontinued / Clearance" flag** while also showing "In
Stock" — may be a site re-listing rather than real. **Check with the LS rep before seeding as active.**

### HK top (stay lift)

| LS | Blum | LF | Notes |
|---|---|---|---|
| 7102412 | 22K2300 | 420–1610 | chip, $98.66 |
| 7102413 | 22K2310 | 420–1610 | sys |
| 7102414 | 22K2500 | 930–2800 | chip, $98.67, LS cat 1-321-350 |
| 7102415 | 22K2510 | 930–2800 | sys |
| 7102416 | 22K2700 | 1730–5200 | chip, $99.14 |
| 7102417 | 22K2710 | 1730–5200 | sys |
| 7102418 | 22K2900 | 3200–9000 | chip, $116.36 |
| 7102419 | 22K2910 | 3200–9000 | sys |
| 7102442 | 22K2300T | 420–1610 | TIP-ON, chip |
| 7102443 | 22K2500T | 930–2800 | TIP-ON, chip, $103.73, LS cat 1-322-350 |
| 7102379 / 7102380 | 22K8000 | — | cover cap set white / dark grey |
| 7115588 | 20S4200A? | — | front bracket set, **alu frame** (LS title says 20S4200) |
| 7102420 | 23KA000 | — | SERVO-DRIVE set |

Missing: TIP-ON 22K2700T / 22K2900T (not on LS — may not exist); front bracket for **timber fronts** (20S4200).

### HK-S (small stay lift)

| LS | Blum | LF | Notes |
|---|---|---|---|
| 7102359 | 20K2B00.06 | 220–500 | |
| 7102361 | 20K2C00.06 | 400–1000 | |
| 7102363 | 20K2E00.06 | 960–2040 | LS says 2040, Blum 2024 catalogue says 2215 |
| 7102437 | 20K2B00T | 220–500 | TIP-ON (LS: obsolete) |
| 7102439 | 20K2C00T | 400–1000 | TIP-ON |
| 7102441 | 20K2E00T | 960–2040 | TIP-ON, $70.47; needs 2 front brackets + TIP-ON unit (separate) |

Missing: HK-S front fix brackets, TIP-ON unit codes.

### HK-XS (small stay lift, with hinges)

| LS | Blum | LF | Notes |
|---|---|---|---|
| 7102355 | 20K1101 | 200–1000 | |
| 7102356 | 20K1301 | 500–1500 | |
| 7102357 | 20K1501 | 800–1800 | |
| 7102433 | 20K1101T | 180–800 | TIP-ON |
| 7102434 | 20K1301T | 500–1200 | TIP-ON |
| 7102435 | 20K1501T | 800–1600 | TIP-ON |
| 7102352 | 20K5101 | — | cabinet fixing, screw-on |
| 7102351 | 20K4101 | — | front fixing, screw-on (1 per mechanism) |
| 7102353 | 20K41E1 | — | front fixing, EXPANDO |

### HF top (bi-fold)

| LS | Blum | LF / KH | Notes |
|---|---|---|---|
| 7115589 | 22F2500 | 2700–13500 | chip |
| 7115591 | 22F2510 | 2700–13500 | sys |
| 7115592 | 22F2810 | 10000–19300 | sys (LS title says 19500) |
| ? | 22F3200 | KH 480–610 | lever arm set — LS 7102364 is the old 20F3200.01 (480–570), confirm |
| 7115594 | 22F3500 | KH 600–910 | lever arm set, $78.99 |
| 7115595 | 22F3900 | KH 840–1200 | lever arm set |
| 7115616 | 23FA000? | — | SERVO-DRIVE set HF/HL/HS |

Missing: 22F2800 (chip, 10000–19300), HF cover caps, HF front brackets, centre hinges.

Source pages: Blum catalogue 2024-25 pp.20–22 (HF top), 44–47 (HK top), 54–56 (HK-S), 61–63 (HK-XS);
lincolnsentry.com.au product pages `/p/<LS code>`.

## Proposed data (LS1)

- `hardware_lift_systems` — one row per **orderable kit line**: `name, brand, family` (hk_top / hk_s /
  hk_xs / hf_top / hl_top / hs_top), `code` (LS), `maker_code` (Blum), `role` (`mechanism` / `lever_arm` /
  `front_bracket` / `cabinet_fixing` / `cover_cap` / `tip_on` / `servo`), `lf_min, lf_max, kh_min, kh_max,
  kb_max, max_front_kg`, `tip_on` bool, `fixing` (chip / sys), `colour`, `cost`, `model_url`, `active`,
  `notes`.
- A **lift set** the front picks = one mechanism row + its companion rows (`companions` jsonb: [{id, qty}])
  so the hardware list prints every LS line (mechanism pair, brackets, cover caps, TIP-ON unit, arms).
- Face zone `lift_id` (like `handle_id`) = the family/default; the resolver picks the mechanism row in
  that family from LF. W1LU defaults to HK top + TIP-ON.

## Phases

| Phase | What | Status |
|---|---|---|
| LS0 | Spec, Blum rules, LS codes | [x] 2026-11-14 |
| LS1 | `hardware_lift_systems` table + policies + Lift systems tab + seed (after LS stock check) | [ ] |
| LS2 | Face `lift_id`, power factor pick + warnings, hardware list lines | [ ] |
| LS3 | Drilling (gable mechanism screws, front brackets, TIP-ON) via joints library — needs Blum assembly pages | [ ] |
| LS4 | Elevation symbol (lift arc), GLB upload + 3D open/closed | [ ] |
| LS5 | HF bi-fold cabinet (split face, centre hinges) | [ ] |
| LS6 | Tutorial lesson | [ ] |

## Questions for Mark

1. Default family for small flaps (375 high): HK top everywhere, or HK-S / HK-XS when the LF fits (cheaper)?
2. ~~Drilling template~~ → use Blum's published assembly figures (to read).
3. Wide flaps (1377 on RHK6468): LF ≈ 2600 → HK top 22K2500 fits; OK, or split narrower?
4. The LS "discontinued" flags — real, or just their site? (ask the rep)
