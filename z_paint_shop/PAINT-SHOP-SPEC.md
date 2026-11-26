# Paint Shop Sheet — Spec & Phase Tracker

> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done
>
> **RESUME HERE** → P1 built 2026-11-18, check pending. Next: P2 per-part colour
> for non-front parts (end panels, kicks, panels), when Mark wants it.

## Locked decisions (2026-11-18)

1. **Report**: Reports → Paint Shop Sheet (room or job scope). **A simple
   form** (Mark 2026-11-18), one per room + paint colour, one per printed page:
   Job, Room, Paint colour, Gloss level (the colour's finish), Date. No parts
   list. A colour with no gloss set shows TBC.
2. **What is painted**: **Satin Board only** (Mark 2026-11-18): parts on a
   `Satin Board …` board or one of its colours, matched by name. No other board
   goes on the sheet. (The `materials.is_painted` tick from P1 was dropped, P1b.)
3. **Colour on each part**:
   - Fronts (doors, drawer fronts, false panels) carry their own colour. The
     resolver saves `face_zones.door_colour_id`, the Colour Ranges colour the
     front resolved to (zone > room class > job class > style default). A
     material-grid front colour (MC6) is a board, not a paint colour, so it
     stores null.
   - Other painted parts (end panels, kicks, shelves, custom panels) take the
     cabinet's first painted front colour (2pac over 2pac). If there is none,
     they take the room colour for the cabinet's class, then the job colour.
   - Fronts saved before P1 have no `door_colour_id`. They use the room / job
     class colour until the cabinet is re-resolved.
   - No colour anywhere: a red **COLOUR NOT CHOSEN** block, listed last.
4. Removed parts (hidden in all views) are left off.
5. **Paint area** (Mark 2026-11-26): every Satin Board part counts **one face
   + all 4 edges**, each edge as a **0.1 m wide** strip whatever the thickness
   (an 18 mm edge is painted as 0.1 m). Edge m² = perimeter (m) × 0.1
   (`PAINT_EDGE_M` in `src/lib/takeoff/paint.ts`). Shown on the Paint Shop
   Sheet form (Parts, Paint area "4.82 m² (face 3.60 + edges 1.22)") and in the
   Takeoff report's **Paint** section per room + job totals: colour, finish
   (gloss), parts, face / edges / total m².

## Phases

- [x] P1 — schema (`face_zones.door_colour_id`), resolver threading, report +
  print, report search box. P1b: Satin Board only, Painted tick removed;
  sheet cut down to the simple form.
  Check pending.
- [ ] P2 — per-part paint colour override on non-front parts (end panel / kick /
  panel picks their own colour).
- [x] P3 — paint m² (one face + edges at 0.1 m) on the Paint Shop Sheet and
  the Takeoff (colour + finish + m²). Built 2026-11-26, in-app check pending.
