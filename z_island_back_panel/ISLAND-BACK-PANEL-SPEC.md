# Island back panels (`IBPF` / `IBPK`) — Spec & Phase Tracker

> Exposed-board panel on the back face of an island bench run, split at the
> sheet width. Update status lines and decisions in the same change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → IBP1–IBP3 built 2026-10-24 (51a9642). Next: IBP4 in-app check by Mark.

## Locked decisions (Mark, 2026-10-24)

1. **Two library items in Base → End Panels**: `IBPF` (to the floor) and `IBPK`
   (to kick height, starts at `r.TOEH`) — codes from the cabinet-code convention.
   Base class, height tracks the cabinet height, **exposed material**.
2. **Library item only** — placed by hand on the island's back side, width typed
   (no right-click "add to run"). Depth = the exposed board (synced).
3. **Width covers the whole run, over the end panels' back edges.**
4. **Sheet width** (default **1200**, editable per panel — grain boards): a wider
   panel splits into **equal pieces** (2500 → 3 × 833.3). Grain runs **up** the panel.
5. **Edging: every edge incl. the joins**; the **bottom edge only on IBPK** (IBPF's
   sits on the floor, raw).

## Data

- `cabinet_definitions.back_panel jsonb`, `cabinet_instances.back_panel jsonb`
  (non-null = an island back panel): `{ mount: 'floor' | 'kick', sheet_w: 1200 }`.
- Case part keys `ibp:<n>` (constraint `^ibp:[0-9]+$`), left → right. Face-kind
  frame as the bulkhead fascia (DY width, DX height, DZ thickness, AY 180, outer
  face at the front), `grain_direction 'vertical'` — the nest turns them (as the
  vertical-grain finger rails) and their tape pairs turn with them.
- Resolver `src/lib/resolver/resolveBackPanel.ts`; settings `src/lib/backPanel.ts`;
  sidebar `BackPanelSection.tsx`; layer item `applied_panels`.
- Migration `migration_ibp1_back_panel.sql` (applied 2026-10-24).

## Phases

- [x] **IBP1 — data + library.** Columns, part-key constraint, IBPF / IBPK rows.
- [x] **IBP2 — resolver.** Equal sheet-width pieces, floor / kick, tape, grain; tests
      (`src/lib/resolver/__tests__/backPanel.test.ts`).
- [x] **IBP3 — UI.** Sidebar (To floor / To kick, Sheet width, piece readout),
      depth sync, cut-list labels "Island Back Panel N", tutorial `island_back_panel`.
      Bridge `placeCabinet({ back: true })` for automation.
- [ ] **IBP4 — in-app check** (Mark): plan, back elevation, 3D, cut list + nest grain.

## Later / open

- Labels come out as base-class `BC-xx` (rename by hand).
- IBPK: the island's exposed back kick below the panel isn't generated here.
- Pieces aren't snapped to the cabinet joins behind (equal split only).
