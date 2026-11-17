# Paint Shop Sheet — Spec & Phase Tracker

> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done
>
> **RESUME HERE** → P1 built 2026-11-18, check pending. Next: P2 per-part colour
> for non-front parts (end panels, kicks, panels), when Mark wants it.

## Locked decisions (2026-11-18)

1. **Report**: Reports → Paint Shop Sheet (room or job scope). Per room, per
   paint colour: a colour box with the name big, plus brand, code and sheen.
   Under it, the parts: Part, Height × Width, Thick, Qty, m² (one face),
   Cabinets. Same part + size rows are merged with a qty.
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

## Phases

- [x] P1 — schema (`face_zones.door_colour_id`), resolver threading, report +
  print, report search box. P1b: Satin Board only, Painted tick removed.
  Check pending.
- [ ] P2 — per-part paint colour override on non-front parts (end panel / kick /
  panel picks their own colour).
- [ ] P3 — painted sides / edges column (one face vs both, edges) if the painter
  wants it.
