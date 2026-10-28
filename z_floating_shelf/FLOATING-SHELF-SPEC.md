# Floating shelf (`FLSHLF`) — Spec & Phase Tracker

> Living spec for the floating shelf: a thick shelf built up from 2 or 3 layers
> of exposed board, edged after glue-up with wide tape, hung on a hidden
> cleat that sits in a pocket in its back (and unseen sides).
> Update status lines and decisions in the same change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → FS1–FS5 built 2026-10-22. Next: FS6 in-app check by Mark
> (place FLSHLF, toggle seen sides / build, check 3D, elevation, cut list + optimiser pockets).

---

## What it is

```
 section through the back (double build)            plan, left side unseen, right seen

  wall │                                    wall ───────────────────────────────
       │◄ 30 ►│                                  │▒▒▒▒▒▒▒ back pocket ▒▒▒▒▒▒▒│◄30►│
       ├──────┬──────────────────┐  top board    │▒▒│                        │    │
       │cleat │░░░░░░░░░░░░░░░░░░│ 16.5          │▒▒│ side pocket            │    │
       │ 20   ├──────────────────┤ ← glue line   │▒▒│ (unseen side)          │    │
       │      │░░░░░░░░░░░░░░░░░░│ 16.5          │  │◄30 stop from front     │    │
       ├──────┴──────────────────┘  bottom board └──┴────────────────────────┴────┘
             10 rebate in each board = 20 pocket                front (always seen, taped)
```

## Locked decisions (Mark, 2026-10-22)

1. **A library item in Wall**, code **`FLSHLF`** (Wall → Open Shelves). Assembly class
   `wall`, no carcass / internals / faces / kick. W, D editable like any cabinet.
2. **Placement: floats at its own height.** It sits at `pos_z` (its underside,
   mm from the floor), not hung from the wall-cab top, so it can go lower than
   the overheads. **Default underside = the wall-cab bottom** (wall-cab top − the
   room's overhead height). Typed / edited like any "Elevation from floor".
   A floating shelf never blocks other cabinets (it often sits under overheads).
3. **Material = the exposed board** (room / job exposed colour) for every layer.
   Thickness follows the board: 16 Polytec matt (16.5 actual) → 2 × 16.5 = 33;
   18 LX ABS grain → 36. Height (`dy`) is synced to layers × board thickness.
4. **Builds** (per shelf):
   - **double** (default) — two full boards glued face to face.
   - **triple build-up** — full top + bottom boards; the middle layer is strips to
     keep the weight down: a **front rail** and **back rail** (full width), **perimeter
     side strips** that butt into the rails, and **cross strips** between the side
     strips at ≤ 600 centres. Strip width default **90**.
   - **triple solid** — three full boards.
5. **Seen toggles: Left, Right** (back is never seen; front and underside are
   always seen). The underside being seen means the bottom board's good face is
   down — pockets are always on each board's inner (glue) face.
6. **Rebates / pocket for the cleat** (double build): each board gets a 10 deep
   (**rebate height**, editable) pocket on its inner face, so the glued pair has a
   **20 high** slot. The slot runs **30 in** (**rebate depth**, editable) from:
   - the **back** edge, always;
   - each **unseen side** edge, from the back to **30 short of the front**
     (**stop**, editable) — the front edge is seen;
   - **seen sides get no rebate**, and the back pocket **stops 30 from that edge**
     (same stop, editable).
   Pockets overrun the open edges by the cutter radius + 1 (as the curved end
   bend pocket) so the slot comes out clean.
7. **Triple builds**: the slot is the middle layer (its thickness high) — the
   outer boards aren't rebated. Solid: the middle board's outline is cut back
   (a through cut-out, no pocketing). Build-up: the back rail sits forward by the
   rebate depth, an unseen side's strip sits in by the rebate depth; a **seen**
   side's strip runs to the back edge, so there the slot stops at the strip width.
8. **Cleats are parts but hand cut** (timber or MDF strip): on the cut list /
   report, **never sent to the CNC**. One back cleat + one per unseen side, sized
   to the slot (slot height × rebate depth). On by default (toggle).
9. **Boards cut to finished size** (for now). **Not taped on the CNC / cut list**:
   every shelf board carries the comment **"build up then edge"** (prints on the
   CNC labels later). The wide tape goes on the glued blank: front + seen sides.
   Tape = the exposed edgeband unless a tape is picked on the shelf; the sidebar
   shows the tape run (lineal mm).

## Data

- `cabinet_definitions.float_shelf jsonb`, `cabinet_instances.float_shelf jsonb`
  (non-null = this item is a floating shelf; copied at placement):
  ```ts
  {
    build: 'double' | 'triple_buildup' | 'triple_solid',
    seen_left: boolean, seen_right: boolean,
    rebate_depth: 30,   // slot depth in from the edge
    rebate_h: 10,       // per board (double) — slot = 2 × this
    stop: 30,           // slot stops this far from a seen edge (front / seen side)
    strip_w: 90,        // triple build-up strips
    strip_spacing: 600, // cross strips, max centres
    cleat: true,
    tape_id: string | null,   // wide tape; null = exposed edgeband
  }
  ```
- Case part keys `fs:<name>` (constraint `^fs:[a-z0-9_]+$`): `fs:top`, `fs:bot`,
  `fs:mid` (solid), `fs:rail_f`, `fs:rail_b`, `fs:strip_l`, `fs:strip_r`,
  `fs:cross_<n>`, `fs:cleat_b`, `fs:cleat_l`, `fs:cleat_r`.
  All horizontal box-frame parts (DY along X, DX along Z, DZ thickness).
- Resolver: `src/lib/resolver/resolveFloatShelf.ts`; settings `src/lib/floatShelf.ts`.
  Board pockets ride on the part as `pockets` (part-local rects + depth, inner face);
  `seamDrillSync.collectFloatShelfPocketRoutes` turns them into generated route pockets.
- Display layer item **`floating_shelves`** (Cabinets group).

## Phases

- [x] **FS1 — data.** Migration (`float_shelf` columns, part-key constraint), types,
      normalise, load / save / copy paths.
- [x] **FS2 — resolver.** Boards per build, pockets / cut-back outline, strips,
      cleats (hand cut, no CNC), "build up then edge" comments; tests.
- [x] **FS3 — placement + views.** Own height (`cabBottomZ`), default at the wall-cab
      bottom, never blocks; height sync to the built thickness; layer item;
      kept out of the overhead dim picks.
- [x] **FS4 — UI.** Floating shelf section in the cabinet panel (build, seen L / R,
      rebate depth / height / stop, strips, cleat, tape + tape run); right-click
      Seen left / right.
- [x] **FS5 — library row + tutorial.** `FLSHLF` under Wall → Open Shelves
      (`migration_fs5_flshlf_library.sql`, applied; copy of BHSL, 1200 × 33 × 250, dy + dz preserved).
      Tutorial `floating_shelf` (Intermediate › Cabinets).

FS1 migration `migration_fs1_float_shelf.sql` applied 2026-10-22. Tests: `src/lib/resolver/__tests__/floatShelf.test.ts`.
- [~] **FS7 — front corner radius** (built 2026-10-28, check pending) (Mark, RHK6586 TV ledge: "floating
      shelf still doesn't show curve"). `float_shelf.radius_l / radius_r` (front corners, 0 = square; capped
      ≤ D each, ≤ W together, `fsCornerRadii`). fs:bot / fs:top get an outline with a true 90° arc
      (`fsRoundedBoard`, bulge tan 22.5°) → 3D, sheets, optimiser, G-code; plan outline sampled
      (`floatShelfOutline` in `cabinetCornerPts`). Triple builds: the middle layer stays square (hand trim).
      Sidebar Front corner radius L / R. Tutorial `floating_shelf_radius`. Replaces hand-drawn
      part_shape_overrides on the boards.
- [ ] **FS6 — in-app check** (Mark): 3D, elevation, plan, cut list, optimiser pockets.

## Later / open

- Shelves longer than the sheet (joins) — not handled.
- Boards cut oversize and trimmed after glue-up — not now (Mark: finished size).
- Tape lineal metres on a job report (there's no cabinet edgeband report yet).
- Pockets aren't drawn in 3D.
- The shelf's other obstacle checks (appliances, waterfall legs) still treat it at
  the overhead height; cabinet blocking (`cabsBlock`) and cross-wall checks are right.
- Pocket face: `output_face: 'back'` = each board's inner (glue) face, the show face
  being `front` — check against how the nest flips flat parts (FS6).
- Width dims: shelves share the outer (bulkhead) row in elevation / plan.
- Elevation height chain (screen + print): each shelf is a gap + its thickness, shelves under
  the overheads before them, the rest after (`stackShelfSegs`, 2026-10-22, Mark asked).
- First real use: RHK6581 Laundry J03, 2 shelves (2026-10-22).
