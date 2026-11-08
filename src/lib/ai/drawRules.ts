// Drawing rules for the AI helper's plan reader (z_ai_helper AI4). Condensed
// 2026-11-08 from .claude/skills/draw-plan/SKILL.md, .claude/skills/cabinet-codes,
// and the draw-plan references (cabinet-vision-conventions, site-sketches,
// job-intake-checklist) — keep in step when those change. Where they disagreed,
// Mark settled it 2026-11-08 (z_ai_helper/AI-HELPER-SPEC.md, AI4 decisions).

export const DRAW_RULES = `
== COORDINATES & WALLS ==
- Units are mm. Plan coords: x goes right, y goes DOWN. angle 0 = east, 90 = south, 180 = west, 270 = north.
- Draw walls head-to-tail: each wall's start = the previous wall's end, exactly.
- Draw them CLOCKWISE: each square corner is a right turn (angle goes up by 90). Example L: left wall {x:0,y:2000,angle:270,length:2000}, then top wall {x:0,y:0,angle:0,length:3216.5}.
- The wall line is the INTERIOR face; thickness goes outward. Default thickness 90, height 2400; use the plan's per-wall height if given.
- Number the walls so Elevation 1 = Wall 1, and so on. The elevation's left edge = the wall start, so read offsets left to right off the elevation.
- offset = mm from the wall start to the cabinet's low end. dx = width along the wall.
- Standard walls: cabinets face into the room.
- Island = a zero-thickness wall (type island) on the centreline between back-to-back runs. It is not part of the clockwise chain.
- Island face = left-perp of the draw direction (y down): drawn west→east (angle 0) it faces SOUTH; east→west (180) it faces NORTH. Pick the direction so the face is where the main fronts go; the opposite run goes on side "back".
- On the back side, offset is still measured from the wall start to the cabinet's low end (as you face the back, your left is the HIGH-offset end).
- Island back panel (IBPF to the floor, IBPK when the kick shows): if the plan doesn't show one, ASK (back panel? IBPF or IBPK?) before drawing the island.
- Islands often have no position dims: estimate the aisle and add a TBC. With no length given, an island matches the run it faces.
- A wall with nothing else attached still needs a side wall, or its cabinets can land behind it.

== HEIGHTS & DEPTHS ==
- SET-UP FIRST: kick height, tall height and the overhead top line come from the job / room set-up. If one the drawing needs is NOT SET, ASK (offer what the plan shows first) and put the answer in room_plan.setup — never assume a default.
- Overheads sit at the SOFFIT line: their tops follow the room's overhead top line (soffit drop from the ceiling, or top line from the floor). Give overheads their height (dy) only.
- Base dy = kick + carcass, never the benchtop. "140 kick + 740 + 20 bench" → dy 880.
- Site sketches: "bench 870 off tile" is finished height; kick = bench − top − 740.
- dz is the CARCASS depth only (no fronts). Standard 600 bench → 560; fingerpull (5 overhang) → 575. A plan depth number is the carcass depth.
- Defaults: overhead depth 350, tall depth 580. Overhead dy comes from the elevation (600, 720…). Tall height is set-up (ask when not set).
- Sketch depths: a number just past a run's end is a DEPTH, not a gap (600 = base, 300 = overhead).
- End panels (BEPF/BEPK/TEPF/TEPK/WEP) get the SAME dz as the carcass beside them; the definition adds the door itself.

== READING DIMENSIONS ==
- Use the INNER per-item chain; check it against the outer chain and the wall length. If they don't add up, TBC.
- Big numbers (400–1400) are cabinets. Small numbers are items too: 16.5 / 18 end panel, 20 / 33 stone or waterfall (not a cabinet), 5 scribe gap, 0.5 hairline gap. "1290 BENCH" style numbers are overalls.
- A 16.5 gap between a base run and a tall is a panel gap — offset past it.
- Every "# n" item, including panels and fillers, is its own entry, in order.
- Elevation symbols: X across a front = door pair; single diagonal = one door (apex at the hinge); stacked fronts = drawers; "INNER DRW" = inner drawers behind doors; PTO = push-to-open; FF = false front; "W F/ END" = stone waterfall end (not a cabinet).
- Sketch shortcuts: "2 OH" = split into 600–800 widths; bases with no widths = equal widths between anchors; n tick marks = n drawers; "2L" = D2-LL; "seen end" = end panel.

== APPLIANCES / GAPS (leave the space empty) ==
- Never put a fridge, dishwasher, oven or other appliance in as a cabinet. Leave its gap, and place the appliance as a FIXTURE from the catalogue (find_fixture) when there's a matching or generic one: sink on the sink cabinet, cooktop on its base, oven in the UBO, rangehood under the WRH, dishwasher / fridge / washer in their gap. Use the brand / model when the plan or schedule names it, else the generic one, and say so in the markup label. Nothing suitable → markup only.
- Dishwasher: if the plan doesn't say integrated or freestanding, ASK. Freestanding: 605 gap with a BEPF each side. Integrated: 600 gap, tight to the cabinets beside it.
- Dishwasher against a wall: a BEPF on the dishwasher side only (no filler at the wall).
- Fridge: open side gets a TEPF from the floor to the top of the fridge overhead; overhead width = gap − filler; no clearance height given → TBC.
- Drawers above or below doors is never one cabinet: a drawer base + a separate unit.

== CORNERS, FILLERS, END PANELS ==
- Seen run end (no wall): BEPF / TEPF to the floor. A panel BETWEEN cupboards (beside an open bay) is TEPK / BEPK on the kick.
- Fillers default to the on-kick versions: BFK / BFKW (base), TFK / TFKW (tall). BFF / TFF only when told. Fillers are 70 wide max.
- Run touching a wall: if the plan doesn't show a filler, leave the run tight and add a TBC ("filler at the wall: 30 or board thickness?").
- Inner drawers / pull-outs in a cupboard against a WALL: 50 filler there. Beside a seen end panel, no filler.
- Wall cabinet boxed in by walls both sides: filler each side; never a carcass straight to a wall.
- Corners: a 900 × 900 corner space → BCNP (pie / L corner). A blind corner (the return run butts across it) → BCNR/L or BCNR/R (one carcass, door + false panel; /L /R = the blind side as you face it), with blind_width = the return run's carcass depth + its door thickness + 2 + 40 (560 + 18 + 2 + 40 = 620), plus a 40 face filler (BFKW 40) at the start of the return run. Diagonal corner = BCNL / WCNL if the library has them, else closest + TBC.
- Nib walls: don't draw them — say where they are in tbc.

== CABINET CODES (CLASS + CONFIG [-STACK] [+INNER] [/MOD]; no sizes in codes) ==
- B = base doors, D = base drawers, W = wall (overhead), T = tall.
- B1D / B2D, W1D / W2D, T1D / T2D, T2D2D. Open: BOPN / WOPN / TOPN. Sink BSK. Bin BBIN. Broom TBR. Fridge housing TFR. Microwave WMIC. Rangehood WRH. Under-bench oven UBO.
- WOT / WOT-COMBI (oven tower kits): don't place — TBC.
- Drawers D<n>-<letters> top to bottom: S = 170, M = 230, L = remainder, at least one L. D2-SL, D2-ML, D2-LL, D3-SLL, D3-SML, D3-MLL, D3-LLL, D4-SLLL, D4-SMLL.
- Inner drawers +I<n> (B1D+I2, T2D+I3). Modifiers /L /R hinge side, /SC scribe, /BF bi-fold, /SLD sliding.
- Panels BEPF, BEPK, TEPF, TEPK, WEP. Under panels BUP, WUP. Island backs IBPF, IBPK. Fillers BFK, BFF, BFKW, BFFW, TFK, TFF, TFKW, TFFW, WF, WFW, WF-L.
- Never invent a code: search the library (find_library) when unsure; if nothing fits, the closest code + a TBC.

== ASK FIRST vs TBC ==
Ask (ask_questions, all at once, before drawing): set-up that is NOT SET (kick height, tall height, overhead top line) · D/W integrated vs freestanding when the plan doesn't say · island back panel when none is shown.
TBC (list, don't ask): wall-run filler type · fridge overhead height / type · island position / aisle · ceiling treatment over overheads · unknown codes · chain totals that don't add up · unlabelled tall section (possible fridge) · sketch strip whose wall is unclear · blind corner door / false panel · nib walls · appliance models, handle size.

== MARKUP (every room — room_plan.markup, on the elevations) ==
- Appliances / fixtures not drawn (dishwasher, fridge, oven, rangehood, microwave…): a dashed box over the space (x along the wall, z heights) + a label, layer general. The label goes inside an empty space (text_inside), e.g. "DISHWASHER SPACE 605W x 880H", "FRIDGE OPENING 900W x 1800H"; add the model or "BY OWNER" when known.
- Every TBC that's about a place on a wall: a cloud round it + the question, layer questions. TBCs that aren't about one place stay in tbc only.
- Site / install notes (push-to-open, scribe on site, oversized cut on site): layer site. Lighting / power: layer electrical.
- Colour callouts only for what the spec block doesn't cover (open box interiors, bulkheads, fillers, a kick in another colour): layer general.
- Short, capitals. Don't repeat the same note on several walls.

== NEVER ==
Never draw benchtops as cabinets. Never draw appliances as cabinets. Never take dimensions from codes. Never delete or replace anything already in the room. Skip job-specific one-offs.
`.trim()
