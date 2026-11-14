# Benchtop colours + stone patterns (z_benchtop_colours)

> **RESUME HERE (2026-11-14):** C1 built (3D + elevation take the colour of what the top is
> made of; Library › Materials › Benchtops has a Colour column) — not checked in-app. Next: C1b
> plan fill, then C2 once Mark answers the open questions below.

Started 2026-11-14 from Mark: "do we have the ability to add stone patterns / colours to our
benchtops yet". Answer then: no — every top drew in the one layer grey (#e7e5e4) in 3D and teal
in elevation; `benchtop_materials.color` existed but nothing read it.

Related: `z_benchtop_builder/BENCHTOP-SPEC.md` (build methods, schedules, per-role overrides),
`z_material_colours/MATERIAL-COLOURS-SPEC.md` (board colours, grain, the MC10 supplier-image plan),
`z_splashback/SPLASHBACK-SPEC.md` (splashbacks share `benchtop_materials`),
`z_display_layers/DISPLAY-LAYERS-SPEC.md` (all drawing goes through the layer API).

## How a top gets its material today

Top → build method → schedule (benchtop → method default → room → job → shop default) → the
schedule row for the worktop / stone slab (`topRow`), with job then room per-role overrides laid
over it (`job_benchtop_materials` / `room_benchtop_materials`, set in the room/job Materials tab).
That row points at a `benchtop_materials` row (stone, laminate, timber…) or a `materials` board
(in-house built-up tops). Jobs pick stone per top by schedule today — e.g. RHK6468 Kitchen has
"20mm Stone – SNB Arabescato Marble Honed" and "20mm Reconstituted Stone – Colour TBC" schedules.

## Locked decisions

1. **Colour comes from the material the top is made of** — `benchtop_materials.color` for
   stone / laminate / timber, else the board's `face_colour` for in-house board tops. No colour
   field on the benchtop itself (a top shows what it's made of; change the material, the colour
   follows). Same cascade as the resolver, including job / room per-role overrides.
2. **Layer colour still wins.** A colour set on the Benchtops layer in a layer set overrides the
   material colour (`layers.colorOf('benchtops') ?? material ?? default`). Line drawing stays
   unfilled; prints keep the white band. No saved set overrides it as of 2026-11-14.
3. **No colour set → old look** (3D #e7e5e4, elevation teal #134e4a).
4. The canvas display now applies the job / room per-role overrides too (it didn't before —
   thickness ignored them), so thickness and colour match the parts list exactly.

## Phases

- [x] **C1 (2026-11-14) Solid material colour in 3D + elevation.** `useBenchtopCatalog.colourFor`
  (loads `benchtop_materials.color`, board `face_colour`, job/room overrides); `BtElevInfo.color`
  carries it to `Room3DScene` BenchtopMesh and `BenchtopElevation`, and to the job-report 3D
  drawings via `btInfoFor`. Library › Materials › Benchtops: new **Colour** column. Not checked in-app.
  Note: the two stone colours in use are pale (#e9e6e1 / #d9d6d0), close to the old grey — set
  real colours on the materials to see a difference.
- [ ] **C1b Plan fill** in the material colour (light tint under the outline, layer-gated, off
  in line drawing / print).
- [ ] **C2 Stone colours without a material per colour.** Proposal (mirrors z_material_colours):
  a colour is a child `benchtop_materials` row (`parent_id` → the stone type, inherits dz /
  finish / cost, auto-named "20mm Stone – Calacatta Nuvo"), so schedules, overrides, the Benchtop
  Quote and supply lists keep keying on one id. Library: Colours panel under a stone type (brand,
  colour name, swatch hex). Job: pick the colour per top / room / job from the existing pickers.
  *Waits on the open questions.*
- [ ] **C3 Generated pattern.** Per material: `pattern` (none / marble veins / speckle /
  concrete), `vein_color`, scale. Drawn procedurally (like woodGrain.ts — no image files), laid in
  plan coordinates at true scale so veins run on across a top and its joins, waterfall legs
  continue the slab. Gated by the Benchtops layer; elevation shows a light hint at most.
- [ ] **C4 Supplier slab images (optional).** Image per stone colour (storage bucket, upload in
  the library, true-size tile e.g. 3200 × 1600), used untinted instead of C3. Share the MC10
  upload / bucket work. Needs the image files sourced (Caesarstone, SNB, Smartstone…).

## Open questions for Mark

1. C2: OK with "stone type → colours" (one 20mm Stone row, many colours under it), or keep one
   material per colour as now?
2. Which stone ranges / colours do you use most? (to seed C2 and set swatches)
3. C3: is a generated marble / speckle look enough for client 3D views, or do you want the real
   slab photos (C4) from the start?
