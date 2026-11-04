# CNC tools — Cabinet Vision fields + import (z_cnc_tools)

Source: Mark's CV export `Tools.pkg` (OneDrive Desktop, 01/11/26). A CV `.pkg`
is a zip: `Package.lst` manifest + one file per item — `.tll` tool, `.tst` tool
set, `.mch` machine, `.gdh` gang drill head, `.ncl` NC link, `.arp` post.
CV stores lengths in **inches** (× 25.4); feeds/speeds are as entered (mm/min, RPM).

## Status

| Phase | What | State |
|---|---|---|
| T1 | 4 new columns on `cnc_tools` + `cnc_drills`, wired into resolver/G-code, editor cards with diagrams | **built 01/11/26**, in-app check pending |
| T1 import | CV tools 103, 104, 106, 107, 108, 110, 111, 112 imported (101/102/109 already existed) | **done 01/11/26** |
| T2 | Tool-set steps to match CV: square-out corners, centre-on-line, step depth wins, ring rebate, through cut, per-tool feeds/rpm; Shaker Door set rebuilt to CV; Glass door profile + Glass Door set | **built 01/11/26**, machine test pending |
| T3 | Glass size for ordering: Reports → Glass Order | **built 01/11/26**, in-app check pending |
| T3b | Tool set section view (sample door section + corner plan) in Settings → CNC Tool Sets | **built 01/11/26**, in-app check pending |
| T3c | Tool set step fields as cards, each with a live diagram (type, depth, tool on the line, fill, ring, raster, width, clean-up radius, offsets, feed/spindle); only the fields that matter for the step type are shown | **built 01/11/26**, in-app check pending |
| T3d | Raster angle 0 / blank = auto: lanes run along the pocket's long side on the sheet (quickest, fixes LED grooves cut side-to-side); any other angle used as set. Lanes spread evenly so the last lane sits on the far wall | **built 04/11/26**, machine check pending |

## Locked decisions (T3, 01/11/26)

1. A tool set with `glass_thickness_mm` set is a **glass recipe**; any front whose
   door profile op uses it is a glass door (no resolver change needed).
2. Glass = opening (door − the op's frame offsets) + the ring step's outward
   offsets − 2 × `glass_clearance_mm` (default 1.5 per side). R3 rebate corners
   need ≥ 0.88 clearance for a square glass corner — 1.5 clears.
3. Report = glazier's order (grouped by size + thickness, with cabinets) then each
   room's panes (door / opening / glass sizes). Printable.
4. Section view: sample door, line 60 in, board thickness editable (default 18);
   steps shaded in order, tools from `shape_profile`; square_off shown on a corner
   plan (it doesn't touch a straight edge). Step without depth drawn at 5.
5. `buildProfile` closing bug fixed (straight bits drew as triangles in every tool
   preview). T109 corrected to a plain flat 40mm (CV profile), was 'rebate'.

## Locked decisions (T2, 01/11/26)

Matched against CV's posted shaker program `z_panel_optimizer/R300301A.anc`.

1. **Each step's own depth wins**; the operation's depth only fills in for a step
   with none (reverses e774351 — Mark: "in CV operation depth was 0 and each tool
   had its own depth"). A depth ≥ the board thickness = right through
   (+ profile |through_cut_z|).
2. **square_off = corners only** (CV corner clean-up): wall → corner → wall, arc back
   round the previous tool's fillet. Cleans the radius left by the previous area
   step's bit (`cleanup_radius_mm` overrides). Never falls back to a full lap.
3. **Tool on the line** per step: `inside` (edge on the line, default) or `centre`
   (V chamfer, VJ).
4. **Ring width** on a pocket step clears only that band in from the edge
   (glass rebate); laps from the inside of the band out, so the last lap finishes the wall.
5. **Every router bit cuts at its own feed / plunge / rpm** (cnc_tools), and a step's
   feed/spindle override beats that. Before this, every internal route ran at the
   material routing tool's values (40mm shaker at T101's 18000rpm).
6. **Step order is kept per part** across tool groups (a tool may be called twice
   rather than run a part's steps out of order).
7. **Glass doors: everything from the back** — rebate, squared corners, opening cut
   through — so a glass-only sheet cuts face down like every other sheet. A sheet
   with front-face routing (shaker/VJ) AND back-face routing warns: needs the 6th-face
   flip (not built).

Shaker Door set (= CV 2ndTest27.01): 1 pocket T109 spiral-out 50% d5 → 2 outline
T107 d5 → 3 square_off T108 d5.4 → 4 outline T104 d1 centre-on-line.
Glass profile (back, frame 60) + Glass Door set: 1 pocket T102 ring 15.9 d6.35
offsets −15.9 → 2 square_off T107 d6.35 offsets −15.9 → 3 outline T102 d99 (through).
6mm glass default (CV rebate 15.9 × 6.35). Door style **Glass — 2pac** (01/11/26): Shaker — 2pac's blank, colour range + default colour with the Glass profile.

## Locked decisions (T1)

1. **Spin direction** — `cnc_tools.rotation` (new) and `cnc_drills.rotation` (existed).
   Reference only; never changes the G-code.
2. **Through extra depth** — `through_depth_adj` on both tables, null = machine
   profile (`through_cut_z` for routing, `drill_through_overshoot` for drills).
   Router value applies to the material's routing tool on the perimeter cut;
   drill value applies to through holes only, per gang (keyed by Ø like `passes`).
3. **Depth to shoulder** — `cnc_drills.depth_to_shoulder` (default false) uses the
   existing `point_angle`: blind holes add r / tan(angle/2), capped at
   thickness − 0.5 so a blind hole can never break through.
4. **H register — NO column.** G-code always derives H = tool number +
   `tool_h_offset_delta` (machine profile); a typed per-tool H is deliberately
   impossible. The editor shows the computed H read-only. (CV stores H = tool
   number; our Anderson profile delta is −90, e.g. T101 → H11.)
5. **Auto-select** — `auto_select` on both tables (default true = old behaviour).
   Drills: off = only used when a hole names the bit; `select_tolerance` replaces
   the 0.5mm snap per bit. Routers: only auto-select tools (plus the profile's
   preferred pocket tool) may pocket an undrillable hole.
   `cnc_tools.select_tolerance` exists but is unused (reserved).
6. Not wired: the generic (non drill-block) drilling loop ignores the two drill
   depth extras, same as it already ignores the profile overshoot.

## Import notes

- T104: CV has two tools on 104 — "V Groove Ingraver" (VJ tool set) and "VJ New"
  (newer copy set). Only **VJ New** imported, as a 90° V-bit, Ø50.4 (CV Size).
- No T105 in the CV export.
- CV 1/4 and 3/4 feed: base feed = the 3/4 value (they only differ on T104: 14000/20000).
- Auto-select set per CV, except the 32mm ball router (CV on → off here, it
  would otherwise pocket 35mm holes). T101 + T109 set off (as CV).
- T109 spindle corrected 125000 → 12500 (CV value).
- CV drills disagree with ours on spin: CV V3 + V5 anticlockwise, V8 + V10
  clockwise; ours are all clockwise. CV head = 10 X + 7 Y spindles; our EVO49
  block = 12 X + 7 Y. Not changed — Mark to confirm on the machine.

## CV tool-set parameters we don't have (T2 candidates)

Per step (`ToolSets` rows): `OpType` (0 route, 2 pocket, 3 corner clean, 4 slats),
`Offset` (signed tool-centre offset), `Depth`, **`CleanUpRadius`** (the corner
radius left by the previous tool that this step cleans out — shaker set:
40mm pocket → 6mm cleans R20 corners → 2mm cleans R3 corners), `DepthRefBottom`
(depth measured up from the panel bottom), `StartAtCorner`, `CleanSideRight`,
`DropOffset`, `SlatEdgeGap` + `FixedSlatWidth` (VJ lines at fixed 100 pitch).
Per set (`ToolSetParams`): glass rebate (`CutForGlass`, `RabbetWidth/Depth`),
`BackRouteToolID`, `NestMargin`, door edge flags (`Door_OEP/IEP/RP/RPD`),
male/female joint tools.
