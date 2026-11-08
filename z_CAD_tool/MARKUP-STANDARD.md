# Drawing markup standard

Status: **adopted 2026-11-07 (Mark)**, first applied to RHK6595 Kitchen
(`z_plan_automation/_tmp-6595-markup.mjs` + `_tmp-6595-markup2.mjs`).

Every room we draw gets marked up with F7 CAD notes (`room_annotations`) on **our CAD
drawings**, on the **plan** and the **elevations**. They print on the shop drawings
(Line Drawing Print). We don't mark up the customer's PDF.

## What to mark up (all four, every job)

1. **Appliances + fixtures not drawn.** Anything on the appliance list or the drawings
   that has no fixture in the room gets a note where it goes. Show the space with a
   dashed box on the elevation and the plan, and give the model or "existing / by owner"
   plus the space size. Examples: dishwasher in its space, fridge, microwave, coffee machine,
   rangehood, pendant lights. Drawn fixtures whose model differs from the list (generic
   oven, a stand-in sink) also get a note with the real model.
2. **Colour callouts.** Any element the title block or spec block doesn't cover, e.g.
   open-box interiors, bulkheads, under panels, fillers, scribes or a kick in another colour.
3. **TBC / queries.** Anything unconfirmed: cloud it on the drawing and put the question
   on the **Questions for Client** layer. Examples: bulkhead colour, handle size, appliance models.
4. **Site / install notes.** Notes such as "oversized, cut on site", "sits on stone",
   "no bottom track", push-to-open and scribes go on the **Site notes** layer. Lighting and
   power (LED strip, pendants) go on **Electrical**.

## Layers (job CAD layers, ByLayer colour, leave `style.color` unset)

| Content | Layer |
|---|---|
| Appliances / fixtures, colour callouts | General |
| TBC / questions + their clouds | Questions for Client |
| Site + install notes | Site notes |
| Mark's site measures / corrections (read + applied by Claude, not drawn by Claude) | Site measure (no print) |
| Lighting / power | Electrical |

## Placement

- Text 2.5 paper mm, centred. Wall elevations print at about 1:22, so a 30 mm-wide
  note wraps about every 650 mm of wall.
- Put a note inside the thing it names only when the space is empty (the dishwasher
  space). Otherwise put it in the **right margin**, past the end wall's hatch (Wall 2:
  x = wall length + 180), stacked top to bottom in height order, with a leader to the item.
  Keep notes off the dimension rows, the title and the cabinet labels.
- Elevation frame: x = mm along the wall from its start, y = −height. Plan: real room mm.
- **Insert only.** Never move or delete Mark's own notes (see the never-delete-user-CAD
  rule). Tag automation notes `style.src = 'markup-std'` so a later pass can find them.
- Check the result in a headless report shot (Plan View + Elevation Views) before handing over.
