# RHK6351 - Rya Projects - 1 Panorama Dr

## Bench Seat (drawn 2026-11-18)

Source: `_JOBS/.../SITE CHECK MEASURES/Bench Seat Site measue 2026-11-17.pdf` + Mark's answers.

- Alcove 2295 wall to wall, side walls 687 L / 690 R. Kick 120 (room TOEH 120).
- BC-01: closed box, fixed panel front (B1D, `false_panel` zone), 450 H incl kick, 680 deep overall
  (661.5 carcass + 16.5 front + 2). Full top, centre division to carry the seat.
- Whole box 16mm PT Woodmatt Tasmanian Oak (`exposed_interior`). New board
  `PT Woodmatt 16mm – Tasmanian Oak Woodmatt` + door colour "Tasmanian Oak Woodmatt" in the
  Flat Grain — Polytec range; room style/colour set at room level (job defaults were copied from RHK6595).
- Layout: `z_plan_automation/layouts/rhk6351-rya-bench-seat.json`.

### Rev 2 - 4 (Mark 2026-11-23) - current state
- BC-01 box: 2295 x 433.5 H (120 kick + 313.5) x 661.5. Cabinet scribe 16.5 left + right (`SCRL` / `SCRR`): box 2262.
- Internals Whiteboard 16.5 (`exposed_interior` off). No full top: front + back rails 120 wide, flat
  (`top_type` double_rail, `RD` 120). 2 divisions (3 bays).
- Front panel Tas Oak in 2 pieces, grain vertical, butt join at the centre (`GAPC` 0): 2 x 1150 x 309.5 = 2300,
  5 oversize overall (`REVSL` / `REVSR` -2.5) so the fitters scribe it to the walls on site.
- WC-01 seat top: separate top on the box, wall to wall - `WUP` (UNDER_PANEL, pos_z 433.5) 2295 x 680 x 16.5 Tas Oak,
  grain along the length, front edge taped. Seat stays 450 overall. Not oversized (only the front was asked).
- Kick left as is: face split 2 x 1147.5 (Mark: split is good), kick frame still 2295 tight.

### Production run RHK6351-R2 (2026-11-23)
- 27 parts, 4 sheets 2415 x 1211: Whiteboard 16.5 x 2 (92 % / 67 %), Tas Oak Woodmatt 16 x 2 (54 % seat top / 34 % fronts + kick faces).
- CNC files: `CNCFiles/RHK6351 - Rya Projects/Bench Seat/` (programs per material folder, cut sheets, labels, .rhkrun).
- PDFs: `_JOBS/.../PDF/Production/RHK6351 - Rya Projects - 1 Pano - Bench Seat - Shop Drawings.pdf` + `... KICK PLAN.pdf`.
- RHK6351-R1 "Bench Seat" (saved 10:10 the same morning, 4 sheets / 27 parts) was not made by this session and was not saved to CNCFiles.

### Open
- [ ] Mark to check the drawing.
