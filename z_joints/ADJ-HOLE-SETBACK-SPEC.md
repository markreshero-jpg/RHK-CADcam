# Adjustable shelf hole setback (`ADJ_HOLE_SB`)

Status: **built 2026-11-08**, in-app check pending. Asked for on RHK6563 (160-deep shaving cabinets).

## What it does

Sets how far the first and last shelf-pin rows sit from the shelf's front and back edges, without swapping joints.

## Decisions

1. A construction rule, default 0. 0 / unset = the joint's own rows.
2. Cascade is the normal rule cascade: method, job, room, cabinet. Job and room: Properties, Adjustable Shelves. Cabinet: Joints tab, Internal Seam Joints box (blank = inherit, 0 = the joint's rows even if the room sets one).
3. Applies to `adj_shelf:side` seams only, per shelf or full bank. It wins over a joint assigned to the seam.
4. Measured from the shelf's own edges, not the gable's (a shelf is set back from the front by `ADJSB_F`).
5. Two or more rows only: first row at the setback, last at depth less the setback, others evenly between. Single-row (centre) joints are left alone.
6. A shelf too shallow for the setback at both ends keeps the joint's rows.

## Known gap

`canvasDB.ts` rebuilds seams from the DB without the rule cascade, for cabinet-assigned joints only, so a cabinet with both a seam joint and this rule can show the joint's rows until it next resolves. The resolve (and so machining) uses the rule.
