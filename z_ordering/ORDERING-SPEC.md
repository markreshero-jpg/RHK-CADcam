# Ordering — Spec & Phase Tracker

> **RESUME HERE** → 2026-11-15 O1 built: `suppliers` table + Suppliers tab, the same buying fields on every
> hardware table (supplier, supplier code, maker code, order unit, pack qty), existing rows backfilled. Migration applied 2026-11-15 (Mark ran it in the SQL editor).
> In-app check pending. CRM side (RHKCRM) not designed yet — Mark to work out how it receives orders.

## Mark's brief (2026-11-15)

When a job is ready to send to the machine, its hardware should turn into orders automatically. Some
items are stocked (picked from the floor), others ordered in. The order goes to **RHKCRM**. "Get the
fields set up right here first; the CRM side later."

## Locked decisions (2026-11-15, Mark)

- **D1 Suppliers list** — a `suppliers` table (name, account no, CRM id, website, notes), not free text.
  One supplier per library item for now.
- **D2 The CRM decides stocked vs order-in** — from its own stock levels. CAD has no stocked flag; it sends
  every line and the CRM splits pick vs order.
- **D3 No prices in CAD** — the CRM owns pricing (the LS price list goes into RHKCRM). Existing cost
  columns stay but are blank / 0; a CRM → CAD price sync may fill them later.
- **D4 Supplier vs maker** — `brand` = the **maker** (Blum, DTC, Finista, Lamello…), shown as "Brand".
  `supplier_id` = who we buy from (Lincoln Sentry, Nikpol…). `supplier_code` = **the supplier's code**
  (what goes on the order and matches the CRM's price list); `maker_code` = the maker's code (Blum 71T6580…).
- **D5 Order unit + pack** — `order_uom` (EA / SET / PR / BOX / BAR / KIT…, as on the supplier's list) and
  `pack_qty` (how many usable units one order unit gives: hinge box 50, rail bar 1). The order rounds the
  job quantity up to whole order units.

## Buying fields (every hardware table)

`hardware_hinges, hardware_hinge_plates, hardware_handles, hardware_slides, hardware_accessories,
hardware_lift_systems, hardware_fasteners`:

| Column | Meaning |
|---|---|
| `brand` | maker (existing column) |
| `maker_code` | maker's code |
| `supplier_id` → `suppliers` | who we buy from |
| `supplier_code` | supplier's product code |
| `order_uom` | supplier's unit (EA, SET…) |
| `pack_qty` | units per order unit (blank = 1) |

Kits / sets: a library row that orders as several supplier lines lists them in `companions`
(lift systems now — [z_lift_systems](../z_lift_systems/LIFT-SYSTEMS-SPEC.md)); may spread to runners
(front fixings) and hinges (plates) later.

## Order flow (PROPOSED — CRM side to design)

1. Room / job marked ready for the machine.
2. The Hardware Pick List build (z_takeoff) runs for the job; kit rows expand into their companion lines.
3. Lines grouped by supplier: `supplier (CRM id) · supplier_code · maker_code · name · qty (rounded to
   order_uom × pack_qty) · job · room · cabinets`.
4. Sent to RHKCRM (API / export — format TBD), which splits stocked (pick) vs order-in (D2) and raises
   the purchase orders.

## Backfill (O1, 2026-11-15)

- Suppliers seeded: Lincoln Sentry, Nikpol, Furnware, Handle House, Momo, CabinetWare (account no / CRM id
  blank — Mark to fill).
- Lift systems: supplier Lincoln Sentry, `order_uom` EA (63 rows, from the LS price list).
- Hinges: the stored codes were Blum codes → moved to `maker_code`, supplier Lincoln Sentry, LS code blank
  (the library rows are generic — "Blum 110" — so no exact LS line).
- Accessories: Finista rail parts → brand Finista, supplier LS; Lamello 7102676 → supplier LS;
  Nikpol rail → supplier Nikpol; Furnware → supplier Furnware.
- Slides: DTC + Nikpol rows → supplier Nikpol; Blum Legrabox → supplier LS (code blank).
- Handles: Furnware / Handle House / Momo / CabinetWare → that supplier; others blank.

## Phases

| Phase | What | Status |
|---|---|---|
| O1 | `suppliers` + buying fields on all hardware tables + Suppliers tab + backfill | [x] 2026-11-15, check pending |
| O2 | Fill supplier codes for the rest of the library (LS price list lookup) | [ ] |
| O3 | Pick list: supplier / codes / order units on each line, kit expansion | [ ] |
| O4 | "Send to CRM" — format + transport agreed with RHKCRM | [ ] waits on the CRM |
