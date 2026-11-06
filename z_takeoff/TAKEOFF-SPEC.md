# Hardware Pick List + Takeoff — Spec

Status: **T1–T3 built 2026-10-27**, in-app check by Mark pending. T4 (CSV) not started. T5 cut-length stickers built 2026-10-30.

Two reports in Reports (Room / Job), for the floor and for quoting:

- **Hardware Pick List**: per room, every hardware product with its qty, a tick
  box and the cabinets it goes in; job totals at the end. Print = rooms one after
  another with a "Picked by / Date" line each, never split across pages (a room that
  won't fit in what's left starts the next page); **Page per room** (remembered)
  gives one room per page (Mark, 2026-11-02 — fewer sheets to print).
- **Takeoff**: per room, summarised for keying into the quoting system:
  cabinet counts, finger pulls, sheets per material (nested), edgetape, hardware.
  Job totals at the end. Prints the same way as the pick list (rooms run on, Page per room).

Code: `src/lib/takeoff/hardware.ts` (classification + hardware rollup),
`src/lib/takeoff/roomSheets.ts` (per-room nest), `app/canvas/[roomId]/TakeoffReport.tsx`
(loader hook, sheets, print HTML), wired in `ReportsModal.tsx`.
Checks: `src/lib/takeoff/__tests__/hardware.test.ts`; real-job dry run
`headlessTakeoff.test.ts` (TAKEOFF_RUN); in-app `z_plan_automation/verify-takeoff.mjs`.

## Locked decisions (Mark, 2026-10-27)

- **D1 Output.** Printable PDF for now (the modal's Print / PDF). CSV export later (T4).
- **D2 Counts.** Base / wall / tall count real cabinets only (corners fold into
  their class). End panels, fillers, bulkheads, shadowlines and floating shelves
  get their own lines. Finger-pull fronts get a count too.
- **D3 Hardware scope.** Only what the resolver places: hinges + hinge plates,
  runners, pull-out bins, handles (knobs / pulls, push-to-open, linear strips),
  hanging rails + rail supports. No derived items (shelf pins, legs, joint
  fasteners) for now.
- **D3a Joint connectors (Mark, 2026-10-30).** Bought-in connectors a joint
  places (Lamello Cabineo, z_joints C4) are counted: group **Connectors**, one per
  set of the joint op that carries the fitting (same sets as the CNC + 3D),
  named from Materials → Accessories. Other fasteners still not counted.
- **D3b Adjustable shelf supports (Mark, 2026-11-05).** Shelf pins are on the
  pick list: group **Shelf supports**, one per pin set the adj shelf joint
  drills (the hole under the shelf — 4 per plain shelf, more where the shelf
  has back rows: L corners, deep shelves). Product = the joint op's fitting
  (Furnware SSW, all three adj shelf joints). The Reports rebuild doesn't know
  the construction method's joint defaults, so cabinets with internal parts are
  re-resolved (not saved) for their fitting joints — `src/lib/takeoff/methodSeams.ts`;
  the pick list waits for them.
- **D4 Pick list layout.** Room → product totals (qty + tick + which cabinets), not per cabinet.

## Rules (as built)

- **Classification** (`takeoffKind`) from the placed definition's library code
  (cabinet-codes skill): `BHSL*` shadowline; `BH*` or a bulkhead setting →
  bulkhead; `FLSHLF*` or a float-shelf setting → floating shelf;
  `[BTW]EP*`, `IBP*`, `BUP`, `WUP`, `*CRVFIXP` → end panel; `[BTW]F*` → filler
  (incl. `BFKANG`, `TFKW`); kick assemblies not counted; everything else is a
  cabinet of its `assembly_class`. Each count line lists the codes behind it
  (no definition = "Custom").
- **Hardware** reads the resolved cabinets the modal holds, after
  `filterRemovedParts` (a removed front takes its hinges / runners / handle).
  Runners count in pairs (one left + one right) per drawer, keyed by product
  (+ length when the name doesn't carry it). Inner-drawer runners are their own
  lines (priced separately, cabinet-codes). One bin per bin front. Handles one
  per front. Rails list each cut length + total metres. Supplier code / brand
  shown when the library row has one.
- **Finger pulls** = fronts whose grip is sharknose / rail / routed / channel:
  counted by grip + product, not picked.
- **Sheets**: each room's saved cut parts (`loadProjectParts`, `output_to_cnc`)
  nested on its own with Stage 4's inputs: the default machine's default
  profile (edgeband deduction, margins), grain locks, grain match blocks,
  balanced quality, rotation on, full sheets only (no offcuts). Per material +
  thickness: sheets, parts, Sheet equiv. (part area ÷ usable sheet area) and
  yield. Job totals = sum of the room nests, plus **Cut together** = the rooms
  nested as one. Parts too big for any sheet / stale shapes are listed and not counted.
- **Edgetape** = the Edgeband Length rollup per room (finished metres + the same
  remembered waste %).

## Phases

| Phase | What | Status |
|---|---|---|
| T1 | Hardware rollup + classification + pick list report | ✅ built 2026-10-27 |
| T2 | Per-room nest sheet counts | ✅ built 2026-10-27 |
| T3 | Takeoff report (counts, finger pulls, sheets, tape, hardware) + print + tutorial `takeoff_reports` | ✅ built 2026-10-27 |
| T4 | CSV / Excel export of the takeoff for the quoting system | not started — needs the quoting system's import format |
| T6 | Rooms share pages on print, each kept whole (`break-inside: avoid`); Page per room tick box; check `z_plan_automation/verify-room-packing.mjs` (RHK6592 pick list 6 → 3 pages) | built 2026-11-02 |
| T5 | Cut-length stickers: Hardware Pick List → **Cut stickers (n)** — one sticker per cut piece (hanging rails, linear handle strips): job, room, type, product + code, Cab #, cut length, n of N. Size / printer / nudge = Optimiser → Labels settings (102 × 48 default). Code `src/lib/takeoff/cutStickers.ts` (shared pager `labelPagesPdf` in optimiser/labels.ts). 2026-11-05: the button opens a print modal (`app/canvas/[roomId]/CutStickersModal.tsx`) sharing Stage 7's print panel (`src/components/labels/LabelPrintPanel.tsx`: size / printer / offset, preview, Print / Download PDF); pick by room, type or sticker number, numbers stay n of N of the whole list | built 2026-10-30, modal 2026-11-05, in-app check pending |
| T7 | Job Reports › Hardware Pick List: **Rooms** tick row (☑ per room + All / None, same ticks as the drawing reports' room row, shared state). Only ticked rooms are listed; job totals, print and cut stickers follow. Room Reports unchanged (one room). Mark 2026-11-07 | built 2026-11-07, check pending |

## Open

- Bulkhead cleats / fascias longer than the sheet (e.g. 2631 on a 2415 board)
  show as "too big for a sheet" and aren't in the sheet count. Decide whether
  they're bought as lengths (a takeoff line) or the board list needs a longer stock.
- Derived hardware (legs, fasteners) if wanted later (D3). Shelf pins done (D3b).
