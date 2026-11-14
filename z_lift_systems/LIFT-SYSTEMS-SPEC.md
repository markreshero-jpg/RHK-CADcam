# Lift systems (Blum Aventos) — Spec & Phase Tracker

> **RESUME HERE** → 2026-11-14 (Mark, RHK6468 butler's pantry): library cupboard **W1LU** added
> (wall, one top-hinged lift-up flap, no hinges, TIP-ON push to open, 375 x 600 x 300 default). The
> mechanism itself is NOT in the app yet: no hardware row, no hardware list line, no drilling. Phases
> below are **PROPOSED**, waiting on Mark.

## Done

- `cabinet_definitions` **W1LU** (cloned from W1D): face zone `door`, `hinge_side: 'top'`, `hinges: []`.
  Stack two for a "split" overhead: the upper hangs off the room's overhead top line, the lower sets its own
  underside with rule `WALLZ` (RHK6468: 1995-2370 over 1620-1995, under panel below).

## Proposed

- **L1 hardware library** — `hardware_lift_systems`: brand, model (Aventos HK-top / HK-S / HK-XS / HF / HL /
  HS), carcass height range, power-factor range, TIP-ON yes/no, part codes (lift mechanism pair, front
  fixing pair, TIP-ON), cost, GLB. Seed Blum Aventos HK-top (22K….) + TIP-ON for HK-top.
- **L2 pick per front** — face zone `lift_id` (like `handle_id`); W1LU defaults to Aventos HK-top + TIP-ON.
  Resolver picks the mechanism strength from **power factor = carcass height × front weight** (front
  weight from the board density × area) and warns when out of range or the flap is too wide/heavy.
- **L3 drilling** — lift mechanism screw positions on both gables (from the top / front edge per Blum's
  template) and the front fixing holes on the flap's back; TIP-ON plate on the carcass. Needs Blum's
  drilling data (template / CAD) — **Mark to supply or OK using the published catalogue figures**.
- **L4 outputs** — hardware list + order sheet (mechanism code per cupboard), elevation symbol (lift
  arc instead of the hinge chevron), 3D open animation.

## Questions for Mark

1. Aventos HK-top for these, or HK-S / HK-XS (smaller, cheaper) for 375 high flaps?
2. Drilling: do you have Blum's drilling template, or use the catalogue numbers?
3. Wide flaps (1377 on RHK6468) — fine for HK-top, or split narrower?
