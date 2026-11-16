# RHK6547 - Fez - 1/18 Catalina Dr Mudjimba - Georgie's Laundry (Supply Only, QUOTE)

Sources (`_JOBS\RHK6500 - 6599\RHK6547- Fez- Catalina\ARCHITECTURALS`): `Laundy Sketch.pdf` (Georgie's hand
sketch from 21 Sep, copy here) + `ChatGPT Image Oct 6...png` (reference render). Emails: 21/23 Sep (LHS against
a wall, no handles - she'll sort, 600 deep OK), 06.10.26 (no benchtop - she gets a stone offcut; add 1 floating
shelf; room 2190 long; urgent). Quote Issue 2 Rev A 14/10/2026 $2,227 ex: Elegant Oak doors/panels + floating shelf.

## Drawn 2026-11-16
- Project 0e903bed-7a27-4278-a2b1-71e051e14290 (created, defaults cloned from RHK6351), room Laundry 20601f2b-4fa7-49c1-bfff-36d1d53ed308.
  Layout `z_plan_automation/layouts/rhk6547-fez-catalina-laundry.json`, `_tmp-6547-setup.mjs` / `-post.mjs` / `-cad.mjs`.
- Job colour: style Laminex 18mm ABS Grain, colour Elegant Oak, exposed LX Abs Grain 18mm Elegant Oak (job_materials).
- Wall 2 (2190): TEPF 18 on the left wall (full height to 2370) | 654 washer/dryer stack opening | TEPF 18 | B1D 500 | B2D 1000 sink, tight to the right wall.
  (Mark's layout A; sketch shows 630 to the base run, render 690.)
- 100 kick, bases 880 incl kick (900 bench with a 20 top), carcass 580 = 600 OA. Kick joined under BC-01/02.
- WC-01 W2D 654 x 600 over the dryer 1770-2370. 30 BH (h_adjust 10) 0-672, front carcase, right return 580.
- Adj shelf in every cupboard. BC-02 rails on edge, hinges [100, 646] under the rail.
- Handles TBC: all door zones handle 'none' (the cloned schedule was Maleny C138).
- Floating shelf left off for now (Mark).
- CAD: spec block + SITE NOTES (plan x 2880), stack space / stack kit / sink / stone notes, TBC clouds (handles, wall filler, W/D models), height dims.
- Resolver 0 issues. Check pending: Mark to look over in the app.

## Open / TBC
- Handles (Georgie "I'll take care of that").
- Right wall: tight or a filler.
- Washer / dryer models (opening 654).
- Sink: 450 x 450 drop-in by others, cut-out on site (answered).
- Floating shelf size / height when it goes back in.

## Rev 1 (Mark 2026-11-16): 18 LX Elegant Oak benchtop
- Top = WC-03 flat WUP (UNDER_PANEL) 1500 x 605 x 18 at 882-900, Elegant Oak (job exposed), 690 -> right wall,
  5 past the doors, one edge taped (WUP default; check it's the front). `_tmp-6547-top.mjs`.
- Bases BC-01/02 carcass 780 -> 782 so the bench stays 900. Stone-by-others notes changed to the Elegant Oak top.
- Sink: 450 x 450 drop-in by others; cut-out size TBC (cut on site or CNC once the sink spec is in).
- Resolver 0 issues. Check pending.

## Rev 2 (Mark 2026-11-16): sink for the visual only, top edging
- Sink = new catalog row "Generic 450 x 450 drop-in sink" (no GLB), centre 1690 / 320 off the wall, rim on the top.
  Tap = Abey Lucia gooseneck as a stand-in. Both room fixtures cut_benchtop false: cut-out done on site. `_tmp-6547-sink.mjs`.
- WC-03 top edged front + both ends (edge_top/left/right), back raw. CAD notes updated. Resolver 0 issues.
