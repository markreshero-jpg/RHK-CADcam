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
| T2 | Tool-set parameters from CV (see below) | not started — Mark to choose |

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
