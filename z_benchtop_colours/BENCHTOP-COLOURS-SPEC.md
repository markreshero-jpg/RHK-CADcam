# Benchtop colours + stone patterns (z_benchtop_colours)

> **RESUME HERE (2026-11-15):** C1 (material colour), C2 (stone colours under a type) and C4
> (supplier slab photos in 3D) built. 100 colours imported under 20mm Stone: YDL Mineral (43) +
> Stone Ambassador Zenith / Kaya (57), 89 with slab photos. Checked headless on Test Kitchen /
> Void Corner Demo (3D slab + library panel); Mark to check in-app. Next: C1b plan fill,
> porcelain ranges (YDL porcelain, SA Vasari 12mm) if wanted, per-top colour.

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
5. **(Mark 2026-11-15) Many colours under one material:** a stone colour is a child row of a
   stone type (`parent_id`), like board colours (z_material_colours). Schedules / overrides /
   quote / resolver still key on one `benchtop_material_id` (the colour's id).
6. **(Mark 2026-11-15) Brands: Stone Ambassador and YDL Stone.** Real slab photos from their
   sites (C4) instead of generated veining (C3 dropped). The photos are the suppliers' own
   marketing images — used inside the app to show clients their stone, not republished.
7. **Slab photo = one whole slab at true size** (`texture_w_mm × texture_h_mm` = the colour's
   slab size). Laid in plan with the slab's long side along the top's longest edge, in room
   coordinates (so tops side by side continue the pattern); box-projected on edges and legs.
   Shown untinted; a Benchtops layer colour wins (no photo then). 3D only; elevation uses the
   swatch hex (average colour of the photo).

## Phases

- [x] **C1 (2026-11-14) Solid material colour in 3D + elevation.** `useBenchtopCatalog.colourFor`
  (loads `benchtop_materials.color`, board `face_colour`, job/room overrides); `BtElevInfo.color`
  carries it to `Room3DScene` BenchtopMesh and `BenchtopElevation`, and to the job-report 3D
  drawings via `btInfoFor`. Library › Materials › Benchtops: new **Colour** column. Not checked in-app.
  Note: the two stone colours in use are pale (#e9e6e1 / #d9d6d0), close to the old grey — set
  real colours on the materials to see a difference.
- [ ] **C1b Plan fill** in the material colour (light tint under the outline, layer-gated, off
  in line drawing / print).
- [x] **C2 (2026-11-15) Stone colours under a stone type.** Migration
  `migration_c2_stone_colours.sql` (applied live): `benchtop_materials.parent_id, colour_name,
  colour_code, range_name, overridden, texture_path, thumb_path, texture_w_mm, texture_h_mm,
  source_url`; trigger `benchtop_colour_inherit` copies dz / material_type / grain / edge profile
  from the type, finish if blank, sheet size unless `overridden`, and names the row
  "<type> – <brand> <colour>"; `benchtop_type_propagate` pushes type edits down. Library ›
  Materials › Benchtops lists types only (chip "N colours"); clicking a type opens
  `BenchtopColoursEditor` (photo, brand, colour, code, range, finish, swatch, slab size, $/m,
  source link, active; brand filter + search; + Add colour; Upload / Replace / ✕ photo).
  Pickers (job / room Materials tab benchtop + splashback roles, Library › Schedules) group the
  colours per type + brand (`src/components/BenchtopSurfaceOptions.tsx`). Per-top colour = a
  schedule per top for now.
- ~~C3 Generated pattern~~ — dropped (Mark chose real slab photos).
- [x] **C4 (2026-11-15) Supplier slab photos.** Public bucket `benchtop-textures` (admin write),
  `<brand>/<colour>.jpg` (≤ 4096 px) + `-thumb.jpg`. `useBenchtopCatalog.textureFor` →
  `BtElevInfo.texture` → `Room3DScene` BenchtopMesh: `src/components/three/slabTexture.ts`
  (`useSlabTexture` cache, `slabUvGeometry` box projection). Import: `stone-colours.json` +
  `import-stone-colours.mjs`; fetch / crop tooling + notes in `tools/README.md`.
  Imported: YDL Mineral 43 (38 photos; Jasmine, Mondo Sand, Silver Star White, Star Burst have
  no published slab, Jasmine / Silver Star White no swatch either), Stone Ambassador 20mm
  Zenith + Kaya 57 (51 photos; Nimbus Grey, Mink Grey, Terazio, Beton, Elysian White publish
  none, Pearl White / Carrara Mist photos over-exposed → swatch only). WA-only colours and the
  discontinued Enchanted White skipped. Not imported yet: YDL porcelain, SA Vasari 12mm porcelain.

## Open questions for Mark

1. Porcelain too (YDL porcelain 12mm, Stone Ambassador Vasari 12mm) — under "12mm Stone"?
2. Prices per range (Zenith Premium, YDL Premium Plus…) — set $/m per colour, or per range?
3. Per-top colour (two colours in one room, e.g. island vs perimeter) — a picker on the top, or
   keep using a schedule per top?
