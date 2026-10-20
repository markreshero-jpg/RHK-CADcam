# Curved End kit for RHK-CADcam

This kit teaches RHK-CADcam how to draw the Resident Hero **Vanity Curved End** natively. It also covers the **both-ends-curved cabinet** variant. Everything in it comes from the working web tool that has already cut real jobs on the Planit S2M Center.

## How to use it

1. Unzip this folder into the RHK-CADcam repo, e.g. `C:\Projects\RHK-CADcam\docs\curved-end-kit\`. Any folder inside the repo works.
2. Open Claude Code in the repo and paste the prompt below.

## Prompt to paste into Claude Code

> Read `docs/curved-end-kit/README.md` and `docs/curved-end-kit/SPEC.md` in full, then `docs/curved-end-kit/reference/curved_end_core.mjs`. This is a parametric product (Vanity Curved End, with RH / LH / DOUBLE hands) that I want built into RHK-CADcam as a native assembly type. Do not change the geometry rules — the reference core is the source of truth and is already shop-proven.
>
> First, look through our codebase and tell me how you plan to fit it in:
> - where the generator lives
> - how its inputs map onto our Job → Room → Assembly → Part → Operation model and the Supabase tables
> - how the parts render in the R3F viewer
> - how its operations (outline, pocket, through-holes, rib cut-out route) reach our DXF / S2M export and the Panel Optimiser
>
> Wait for my OK before writing code. When it is built, prove it: for every case in `fixtures/cases.json`, generate the parts through our own pipeline, export the DXFs to a folder, and run `node docs/curved-end-kit/fixtures/check_dxf.mjs docs/curved-end-kit/fixtures/dxf/<case> <our output folder>/<case>`. Every case must print all `ok`. Case `10_warn_radius_too_big` must be blocked with the warning shown in `fixtures/expected.json`.

Claude Code will most likely suggest one of two approaches. Either works:
- **Wrap the core:** import `curved_end_core.mjs` almost as-is (it is plain ES-module JavaScript with no dependencies). Then write an adapter that turns its `calc()` result into RHK parts and operations. This is the fastest and safest route.
- **Port it:** rewrite the core into RHK's own geometry types. This is cleaner long-term. The fixtures are there to catch any drift.

## What's in the kit

| File | What it is |
|---|---|
| `SPEC.md` | The full rule set in plain English. It covers parts, inputs and defaults, coordinate conventions, every derived dimension and formula, rib spacing, pockets, fixing holes and blocks, DXF layer names, validation rules, and the shop-floor lessons learned. **Start here.** |
| `reference/curved_end_core.mjs` | The geometry and DXF engine lifted straight out of the live tool, as an ES module. `calc(p)` gives every part's shape, holes and pockets. `dxfParts(p)` gives the DXF text per part. |
| `reference/curved_end.py` | Python twin (ezdxf). It matches the JS to 0.01 mm. It is useful as a second reading of the same rules. |
| `reference/vanity-curved-end-page.html` | The whole web tool, for reference: 3D viewer, inputs, shop drawings PDF and job files. Open it in a browser to see the product and play with the inputs. |
| `fixtures/cases.json` | 10 test cases: RH, LH, overhangs and scribes, tall with rib cut-out and onion skin, fixing blocks (100 and 60, 16 face board), DOUBLE full and half-round, and one invalid case. |
| `fixtures/expected.json` | For each case: the warnings, notes, key derived sizes (wrap length, pockets, rib count and pitch, part sizes, blocks) and the list of DXF files. |
| `fixtures/dxf/<case>/` | The exact DXFs the shop tool produces for each case (the golden files). |
| `fixtures/check_dxf.mjs` | Compares two DXF folders entity by entity: layer, closed flag, vertices and bulges, circles. Tolerance is 0.01 mm and entity order is ignored. Exits 1 on any difference. |
| `fixtures/make_fixtures.mjs` | Regenerates `expected.json` and the golden DXFs from the reference core. Only run it if the reference rules are deliberately changed. |

## Commands (Node 18+)

```bash
# compare RHK's output for one case against the golden files
node fixtures/check_dxf.mjs fixtures/dxf/05_rh_blocks  path/to/rhk-output/05_rh_blocks

# rebuild the golden files (only after an intentional rule change)
node fixtures/make_fixtures.mjs
```

## Suggested mapping onto RHK-CADcam

This is a starting point; Claude Code should confirm it against the real code.

- **Assembly** is the curved end, with type e.g. `vanity_curved_end`. The `SPEC.md` §2 inputs are its parameters, stored as JSON on the assembly so a job reloads exactly.
- **Parts** are one per DXF file:
  - `ext_FaceBoard` uses face-board material at `FT`.
  - Everything `int_…` uses carcass material at `T` (16.5 white melamine).
  - Part name = file name. There are no mirrored parts: handed formers are drawn as their true top view.
- **Operations** per part, each with its S2M layer:
  - outline: `OUTLINEZ<t>L`, clockwise
  - face-board pocket: `PKZ<FT−SK>`, on the back face
  - Ø5 through-holes: `VBOREZ<T+0.2>`
  - rib cut-out: `ROUTEZ<T−onion>L`, anticlockwise
- **Viewer:** the face board needs to render as a bent wrap (flat length = `wrapLen`), with the skinned zone visible. The reference page's Three.js code shows one way to do it.
- **Optimiser:** the face board is a long part (`wrapLen` plus overhangs). Grain rules are open; see `SPEC.md` §8.

## Open items carried over

These are listed in `SPEC.md` §8:
- a pocket cut too deep on one job (exporter checked OK; machine-side cause not yet confirmed)
- S2M tool numbers (`T` keyword) not yet assigned
- grain direction for a grain face board not yet applied
- shop drawings to be restyled to the house (banquette) style
