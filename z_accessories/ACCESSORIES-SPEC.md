# Accessories library (hanging rails first)

Started 2026-10-25 (Mark, RHK6581 WIR / bedrooms). Bought-in bits that go
inside or on cabinets but aren't hinges, handles or slides: hanging rails and
their supports now; wardrobe / pantry / misc items later on the same table.

## Locked decisions

- **A1 One "Accessories" tab** in Library → Materials (not "Misc", not
  "Wardrobe"): table `hardware_accessories` with a `category` column
  (`hanging_rail`, `rail_support`, `other`) so wardrobe, pantry and misc items
  share one list and filter by category.
- **A2 Hanging rail row** carries the profile size the resolver draws
  (`width_mm` across, `height_mm` up — Finista oval 15 × 30), `stock_length_mm`
  (3600 bars), colour (drawn in 3D), supplier code, cost per bar.
- **A3 Supports are their own rows** (`category = 'rail_support'`); a rail
  links its `end_support_id` / `centre_support_id`, and `max_span_mm` says when
  a centre support is needed. Counting supports for orders comes in A6.
- **A4 Default rail** = the active `hanging_rail` row with `is_default`. A rail
  fitting with no `product_id` uses it; no rows at all → the old built-in
  15 × 30 (`HANGING_RAIL_OVAL`), so existing rooms don't change.
- **A5 Per-fitting pick**: the Interior editor's rail fitting gets a Product
  select (Default + every active rail). The resolved part carries
  `accessory {product_id, name, colour}` (persisted on `internal_parts.accessory`)
  so saved-part views (room 3D) colour it too.

- **A6 Supports belong to the rail** (Mark, 2026-10-25): no new kit or
  interior item. The rail fitting places its own supports, which move with it:
  - rail end against a gable → **end support** (screwed to the gable);
  - rail end with no gable, or an open end where another rail runs the other
    way → **end pillar** (hangs from the shelf above);
  - rail longer than **1000** (`max_span_mm` = 1000) → centre pillars, evenly
    spaced, hanging from the shelf above.
  Per-rail override in the Interior editor (support type each end, centre
  pillar count, drilling on / off).
- **A7 Models**: each support row gets the fixture / handle model columns
  (`model_url`, `model_format`, `model_scale`, `model_rot_x/y/z`,
  `model_off_x/y/z`), uploaded on the Accessories row to storage bucket
  `accessory-models` (same loader, `ModelAsset`). Anchor = rail centre at the
  mounting face (gable face for an end support, shelf underside for a pillar),
  rail along +X. Source files kept in `z_accessories/models/`.
- **A8 End support drilling = a joint, not a hand master drill.** The hole
  pattern lives once in Library → Joints ("Finista end support"); the end
  support row links it (`joint_id`). The resolver makes a rail-end ↔ gable seam
  at the rail's height, so the holes move with the rail and go through the
  optimiser like shelf / carcase joints. Hand master drills are per cabinet and
  keyed to the part number, so every rail in every job would need one added.
  Pillars: no drilling for now.

## Phases

| Phase | What | Status |
|---|---|---|
| A1 | Table + RLS + Accessories tab + seed Finista oval 15 × 30 white 3.6 m + supports | built 2026-10-25 |
| A2 | Resolver: rail size / colour from the product, `accessory` persisted | built 2026-10-25 |
| A3 | Interior editor Product select on the rail fitting | built 2026-10-25 |
| A4 | Tutorial | built 2026-10-25 |
| S1 | Model columns + upload / preview on Accessories rows (A7) | not started |
| S2 | Rail places its supports (A6) — 3D + elevation, Interior editor overrides | not started |
| S3 | End support joint (A8) → gable drilling → optimiser | not started — needs the hole pattern |
| A6 | Hardware list / ordering: rail bars (cut lengths → 3.6 m stock), end supports ×2 per rail, centre supports per `max_span_mm` (1000) | not started |
| A7 | Other categories (wardrobe pull-downs, trouser racks, pantry baskets …) | not started |

## Seed (Lincoln Sentry, 2026-10-25)

- Finista Oval Hanging Rail 15 × 30mm 3.6m White — product 7104006, cat
  1-490-110, aluminium powder-coat, $32.22 inc GST. **Marked discontinued /
  clearance on the LS site** — check with the supplier before ordering.
- End support 1-490-112 / 1-490-114 (page doesn't say how they differ),
  centre pillar 1-490-116, end pillar 1-490-118 — no prices on the page.
- `max_span_mm` left blank (not published).
