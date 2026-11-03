# Drawer back → bottom screw holes

Status: **built 2026-11-03, in-app check pending.**

## What
Screw holes through a drawer box back into the back edge of the bottom. The resolved
system box (DTC Dragon Pro) has the back standing behind the bottom's back edge, on the
same floor (`DB_BACK_SETBACK`, `DB_BACK_Y_OFFSET` = dado height), so screws go
horizontally: entered from the back's rear face and bored front-ward.

## Locked decisions
- Driven by a **joints-library joint** chosen on the drawer box method
  (`rules.DB_BACK_JOINT_ID`, Library → Drawer Boxes → Back → Bottom Holes). The joint's
  ops are attached to the rules at load time as `DB_BACK_JOINT_OPS` (loadCabinetInput 11b).
- Seeded joint **Drawer Back Screw**: 5 mm, depth `TB` (through the back), height
  `T / 2` above the bottom's underside (middle of the bottom edge), auto tool.
  Count by back width `D`: 0–400 → 0, >400–700 → 1, >700–1000 → 2, >1000 → 3
  (`D > 1000 ? 3 : D > 700 ? 2 : D > 400 ? 1 : 0`). Set on DTC Dragon Pro + DTC Dragon Pro (Inner).
- Holes are **centred on the back, laid out from the centre outward**. Blank spacing =
  evenly spread, width / (qty + 1); a fixed spacing is centred too.
- Unlike other joints, qty may be **0** (no holes).
- Expression vars: `D`/`L` back width, `T` bottom thickness, `TB` back thickness, `H` back height.
- A back sitting on top of the bottom (five-piece dado box) gets no holes.
- Holes ride on the left rail's `drills` as `surface: 'drawer_back'`, `source: 'db_back_joint'`
  (`dbBackJointDrills`, slideDrilling.ts), so 3D/2D views, the Part Editor and the optimiser
  (seamDrillSync) pick them up for face drawers and inner drawers alike. The back top
  marker ignores them. Bins are not drilled.

## Pending
- In-app check by Mark (re-save a room with Dragon Pro drawers, look at a drawer back).
- Confirm 5 mm through is right, or a pilot depth into the bottom is wanted.
