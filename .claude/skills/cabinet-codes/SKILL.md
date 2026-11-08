---
name: cabinet-codes
description: The RHK-CADcam cabinet library naming convention. Use this skill whenever reading or writing cabinet codes, marking up or interpreting a plan, seeding or extending the cabinet library, resolving drawer front heights, placing cabinets from a marked-up drawing, or producing estimating rollups grouped by cabinet type. Trigger this any time a cabinet, end panel, or filler needs to be identified by code — including when the user pastes a plan markup, asks "what does this code mean", or asks for new library entries. Do not invent ad-hoc codes; always resolve against this convention.
---

# RHK-CADcam Cabinet Codes

The naming convention for the cabinet library. Codes identify **carcass configuration only**.

## Core principle

A code describes *what kind of box it is*. Nothing else.

Dimensions, materials, finishes, door styles, handles, hinges, drawer systems and edge banding are **not** in the code. They resolve from the L1/L2/L3/L4/L5 hierarchy schedules. Dimensions come from the marked-up plan at placement time.

Rationale: if any of that leaks into the code, the library multiplies combinatorially and the copy-not-link model stops meaning anything. One code covers every width, every material, every door style.

## Grammar

```
CLASS + CONFIG [-STACK] [+INNER] [/MOD]
```

No numeric size tokens anywhere.

### Classes

| Prefix | Class |
|---|---|
| `B` | Base, door-fronted |
| `D` | Base, drawer-fronted |
| `W` | Wall |
| `T` | Tall |
| `KB` | Kickboard |
| `BH` | Bulkhead / infill |

End panels and fillers are not their own class prefix — they encode their class
as the first letter (`BEPF`, `WEP`, `TFK`…), see their section below.

### Door configs

| Code | Meaning |
|---|---|
| `B1D` | Base, one door |
| `B2D` | Base, pair of doors |
| `W1D` / `W2D` | Wall, one door / pair |
| `T1D` / `T2D` | Tall, one / pair of full-height doors |
| `T2D2D` | Tall, pair over pair (four doors, split) |
| `T1D1D` | Tall, single over single |
| `BOPN` / `WOPN` / `TOPN` | Open (no fronts) |
| `BSK` | Base, sink — in the library 2026-10-18: 900, pair of doors, no shelf, comes with the Zalo double bowl + pull-out mixer (z_ubo) |
| `BCNR` / `WCNR` | Blind corner |
| `BCNL` / `WCNL` | Diagonal corner |
| `BCNP` | L corner (pie) — square L, bi-fold doors; legs at the run's base depth |
| `UBO` | Under-bench oven housing (base class) — in the library 2026-10-18 (z_ubo): 600 wide, fixed panel / 600 open / fixed panel, oven shelf, back rail only |
| `WOT` | Wall oven tower (tall class) — a **kit** (rebuilt 2026-10-19, z_wot): no gables; TEPK either side, D2-LL (650, full top), oven core on 80 cleats, open microwave box (exposed shelf + back panel, 380 clear), W2D 400 deep over it (off the wall, bottom scribe + under panel). One pick drops all five cabinets |
| `WOT-COMBI` | Wall oven tower with an integrated microwave / combi / steam oven (user code "for now", 2026-10-19): as `WOT` but a combi shelf (interior, 20 back) on the oven cleats and the combi on its own 450 cleats; W2D straight on top |
| `TFR` | Fridge housing |
| `WMIC` / `WRH` | Microwave / rangehood. `WRH` in the library 2026-11-04 (Wall › Appliances, z_rangehood): undermount rangehood — W2D carcass, pair of doors, hole through the bottom (+ the WUP under it), fixed shelf at 350 with a flue notch, notched top, flue box; hole size set per job in the Rangehood section |
| `BBIN` | Bin unit |
| `TBR` | Broom unit |

`UBO` and `WOT` are shop-vocabulary codes (decided 2026-08-06, superseding
`BOV`/`TOV`) and do **not** follow the class-prefix rule: `UBO` is a **base**
cabinet and `WOT` is a **tall** — despite the `W`, a `WOT` is not a wall
cabinet. The parser must resolve `class` from the config token table, never
from the first letter, for these two. `WOT-COMBI` is one config token too — its `-COMBI` is not a drawer-stack suffix.

Tall door configs read as **door banks, top to bottom** (same reading
direction as drawer stacks), each bank `1D` or `2D`. The split height between
banks is not in the code — it resolves from a room/job default (e.g. aligned
to the wall-cabinet datum), overridable at placement. `TP` is **retired**
(carcass-identical to `T2D`; decided 2026-08-06) — "pantry" is not a carcass
config, just a tall with a shelf/inner pack. Read legacy `TP` markups as
`T2D`.

### Modifiers

Appended after `/`:

- `/L` `/R` — hinge side (singles) or blind side (corners)
- `/SC` — scribe
- `/PK` — packer
- `/BF` — sliding bi-fold pair (Lincoln Sentry Finista BF-05). In the library as
  `W2D/BF` (e.g. an appliance cupboard on the bench) and `T2D/BF`, added 2026-10-30.
  A setting on the cabinet (`rule_overrides.BIFOLD` = hung-on side, plus
  BIFOLD_BOTTOM / BIFOLD_CENTRE in the sidebar). See `z_bifold_slide/BIFOLD-SLIDE-SPEC.md`.
- `/SLD` — Häfele Slider SC sliding robe doors in a recess (no carcass): `T2D/SLD` (2 doors,
  double track), `T3D/SLD` (3 doors, double track), `T3D/SLD3` (3 doors, triple track), added
  2026-11-04. Width = inside width, height = inside height. `rule_overrides.SLIDER` + profile /
  finish / rail in the sidebar. Not `/SC` (that is scribe). See `z_slider_sc/SLIDER-SC-SPEC.md`.
- `/FL` — floating: wall-hung base, no kick, normal carcass bottom, gable ends taped; optionally sits on a `BUP` run under panel (carcass scribes up by its thickness) (e.g. `D2-LL/FL` floating vanity). A setting on the cabinet (`rule_overrides.FLOAT`), not a separate code family — see `z_floating/FLOATING-SPEC.md`

## Drawer stacks

Format: `D<count>-<letters>`, letters read **top to bottom**, one letter per drawer front.

| Letter | Meaning | Default height |
|---|---|---|
| `S` | Shallow | 170 mm |
| `M` | Medium | 230 mm |
| `L` | Large / pot | remainder |

`S` and `M` are fixed nominal heights. `L` is a **residual** — it absorbs whatever is left.

### Examples

| Code | Stack |
|---|---|
| `D2-SL` | shallow over large |
| `D2-ML` | medium over large |
| `D2-LL` | two equal larges |
| `D3-SLL` | shallow over two equal larges |
| `D3-SML` | shallow, medium, large |
| `D3-MLL` | medium over two equal larges |
| `D3-LLL` | three equal |
| `D4-SLLL` | shallow over three equal |
| `D4-SMLL` | shallow, medium, two equal larges |

Legacy mapping from the old library (migrate these):

| Old | New |
|---|---|
| `D2` | `D2-SL` |
| `D2E` | `D2-MM` → but note: must become `D2-LL` if the intent was "equal and fill the stack" |
| `D3-1S2Pot` | `D3-SLL` |

The old `E` (equal) flag is retired — equality is implied by repeated letters.

### No combination units

The shop **never** builds drawers above or below doors in one cabinet. There
is no code for it; a markup showing one is a drawing error — query it.

## Drawer height resolution algorithm

At placement, for a stack of `n` fronts in an available front-stack height `H`:

1. `fixed = (count(S) × S_height) + (count(M) × M_height)`
2. `reveals = total of all inter-front and edge reveals per the job reveal schedule`
3. `remainder = H − fixed − reveals`
4. `L_height = floor(remainder / count(L))` for each `L`
5. Any rounding leftover (`remainder − L_height × count(L)`) is added to the **bottom-most `L` only**, so the stack always sums exactly to `H`

### Constraints (enforce at placement, not at nest)

- **At least one `L` is required** in every drawer stack. Reject `D2-SM` — it leaves an unallocated gap with nowhere to go. Error message should suggest the `L` substitution.
- **Minimum `L` height** — if resolved `L_height` falls below the drawer system's minimum front height (from the hardware schedule), flag at placement with a blocking warning.
- Equal letters must resolve to equal heights (the `floor` + bottom-absorbs-remainder rule guarantees this within 1 mm).

### Height table location

`S_height = 170`, `M_height = 230` live in a **job-level (L1) drawer height table**, overridable at L2 (room) and L3 (assembly) per the standard hierarchy. Never hardcode these values in the resolver — read them from the resolved schedule.

## Inner drawers

**Scope for v1: behind doors only.** Inner drawers behind drawer fronts are deferred and handled manually — do not implement the `@n` host-index syntax yet.

Suffix on a door-fronted cabinet:

| Code | Meaning |
|---|---|
| `B1D+I2` | single door, two equal inners behind |
| `B2D+I1` | pair of doors, one inner |
| `B2D+I1S1L` | pair of doors, one shallow + one large inner |

Bare `+I<n>` means n equal inners. Letters may be supplied for specificity.

Vertical placement of inners within the clear opening is **not** carried by the code. It resolves from an L1 rule (e.g. "inners centre in the clear opening"), overridable at L3.

**Exception — bins:** `BBIN+I1` is a pull-out bin with one inner drawer above
it, behind the bin front (z_bin_cabinet B-D7). The resolver picks the tallest
bin that leaves the `BINUP` rule clear above it (default 140) and warns if none
does. Bin width is never in the code: `BBIN` widths come off the plan
(300 / 400 / 450 / 600; anything else warns and offers divisions).

Inner drawer hardware is a **separate schedule line** from the outer drawer system — Blum and Hettich price them independently, so estimating must not inherit the outer system's cost.

## End panels and fillers

End panels and fillers are **standalone L3 assemblies containing a single L4 part** — not properties hanging off a host cabinet. This is required so they get a nest entry, a drawing, and a cost line.

### End panels

| Code | Meaning |
|---|---|
| `BEPF` | Base end panel, runs to the floor (the ~95% default) |
| `BEPK` | Base end panel, sits on the kick |
| `TEPF` | Tall end panel, runs to the floor |
| `TEPK` | Tall end panel, sits on the kick |
| `WEP` | Wall (overhead) end panel |

All five are in the library and share one Applied Panel part (exposed
material, depth `cab.d + t.door + 2`). The `K` forms (`BEPK`, `TEPK`, added
2026-10-18, `z_cabinet_library/migration_bepk_tepk_library.sql`) carry **no
kick of their own**: the panel starts at `y = r.TOEH` with `dy = cab.h - r.TOEH`.

### Under panels

| Code | Meaning |
|---|---|
| `BUP` | Base under panel — one exposed panel under a run of base cabinets, between the end panels, carcass depth (fronts cover its edge). The carcasses over it get a bottom scribe (SCRBT) of its thickness. Right-click → Add under panel. Added 2026-10-21 (z_floating F8; briefly `BBP`) |
| `WUP` | Wall under panel — the same under a run of overheads |

Fridge spaces have no dedicated panel code — the panels flanking a fridge gap
are just tall end panels (`TEPF`/`TEPK`).

### Island bench back panels

| Code | Meaning |
|---|---|
| `IBPF` | Island bench back panel, runs to the floor |
| `IBPK` | Island bench back panel, to kick height — kick is exposed below and gets a finished back face |

Both in the library (Base › End Panels, added 2026-10-24, `z_island_back_panel`): exposed board placed on the island's back side, width typed to cover the run incl. end panels; wider than the sheet width (default 1200, per panel) → equal pieces, grain up, taped all round incl. joins (bottom only on IBPK).

Screwed through the back of the island cabinets (~99% of islands have one).
Pencil's plan sketches often omit it — when placing an island with no back
panel marked, **query it / assume present** rather than silently omitting.

### Fillers

Pattern: class letter + `F` + `K` (sits at kick height) or `F` (runs to floor)
+ optional `W` (wide).

| Code | Meaning |
|---|---|
| `BFK` | Base filler, at kick height, **material thickness**: one board flat between the cabinet and the wall, standing side-on, only its front edge seen (Mark 2026-11-08) |
| `BFF` | Base filler, runs to floor |
| `BFKW` | Base filler, kick height, wide: the face filler in the door plane (70 default) |
| `BFFW` | Base filler, floor, wide |
| `WF` | Wall (overhead) filler — hangs, so no K/F variant |
| `WFW` | Wall filler, wide |
| `WF-L` | Wall filler, L-shaped, material thickness: one board between a wall cabinet and the wall, seen on its front edge; side view is an L (70 front leg + 70 bottom leg, seen from underneath), front + bottom taped (Mark 2026-11-07) |
| `TFK` / `TFF` (+`W`) | Tall fillers, same pattern as base |
| `BFKANG` | Base angled corner filler: two mitred face fillers (40 mm visible each, adjustable) to kick height in an angled inside corner, over a doorless support carcass that can be switched off (return cleats instead). Angle comes from the walls on placement (default 45°). See `z_angled_filler/ANGLED-FILLER-SPEC.md` |

`BFKANG` confirmed and added to the library 2026-10-15. `WF` and `WFW` confirmed 2026-08-06. Tall fillers (`TFK`, `TFF`, `TFKW`,
`TFFW`) confirmed 2026-10-12; all four are in the library (`TFK`/`TFKW` added
2026-10-21, `z_cabinet_library/migration_tfk_tfkw_library.sql`; `TFKW` defaults
to 30 wide). `BFK`
added 2026-10-18 (`z_cabinet_library/migration_bfk_library.sql`). **All kick
fillers carry their own kick** (`has_toekick = true`) so Join Kicks picks them
up; the Filler part uses `y = cab.kick`, `dy = cab.h - cab.kick` — correct both
standalone and after joining (the join raises the member and zeroes
`cab.kick`; never use `r.TOEH` here, it double-raises). **2026-11-08 (Mark):** `BFK`
changed to the side-on material-thickness board (set its width to the board,
18 / 16.5; part `orientation: 'side'`, `dx = cab.d + t.door + 2`, front edge
= `edge_right`), and the old front-face filler saved as `BFKW` (70 default).
BFKs placed before then keep their own front-face part. `WF-L` added 2026-11-07
(side-part notch, `z_plan_automation/_tmp-wfl-def.mjs`).

With modifiers: `BEPF/D` (deep — wraps past the cabinet to bench edge),
`WF/SC` (scribe), `TFK/CN` (corner clearance). All end panels are applied
panels — there are no structural panels.

Material: end panels, fillers, and island back panels are **exposed parts** —
they resolve to the class schedule's single `exposed` material row (decided
2026-08-09), the same row used by open shelves and by cabinets with the
`exposed_interior` flag. There is no separate end-panel material schedule.

### Legacy library names (rename at migration)

| Current definition | New code |
|---|---|
| `End Panel` | `BEPF` |
| `Wall End Panel` | `WEP` |
| `Tall End Panel` | `TEPF` |
| `Filler` | `BFF` (its height is `cab.h`, so it runs to the floor) |
| `B2` | `B2D` |
| `D2` | `D2-SL` |
| `D3-1S2Pot` | `D3-SLL` |
| `P2-3ID` | `T2D+I3` |
| `Tall Cabinet` | `T2D` |
| `Wall Unit` | `W2D` (retired, inactive) |

All of the above were applied to the CADcam library on 2026-10-12.

## Kickboards and bulkheads

- `KB` — kickboard. Height resolves from job properties (normally 140 mm);
  never in the code.
- `BH` — bulkhead / infill. Sized off the soffit height from room/job
  settings. (2026-08-06: Pencil reports the app's soffit-height behaviour
  isn't working properly — investigate before relying on it.)
- `BHSL` — shadowline (bulkhead class, added 2026-10-19, z_bulkhead B6): a flat
  exposed strip (board thickness × 60) on the overhead tops, flush with their
  front; optional returns back to the wall. Sits on the overheads — the soffit
  is set to the board thickness.

## Tall heights

No height-band token in tall codes (decided 2026-08-06). Tall heights default
from room/job settings; when reading a plan that doesn't state a tall height,
**prompt Pencil** rather than guessing.

## Plan markup format

Dimensions are written on the plan by the user; the code is written on the cabinet. (No position-numbering system — the app's existing auto labels are used as-is.)

## Data model notes

- `library_code` is the unique key on the library table
- On placement, snapshot the code onto the instance as `source_code` (copy-not-link — library edits never mutate a placed instance)
- Also persist parsed `code_class` and `code_config` columns at placement so estimating rollups can group without regex over the full code string
- Retired codes are **never reused**, only superseded

## Parser requirements

The code parser must be a pure function in the service layer (no UI dependency, per the service-layer invariant). It should:

- Accept a code string, return a structured object (`class`, `config`, `stack[]`, `inners[]`, `modifiers[]`)
- Round-trip: `format(parse(code)) === code`
- Reject unknown class/config tokens with a clear error rather than silently passing through
- Validate the at-least-one-`L` rule at parse time
- Be case-insensitive on input, normalise to uppercase on output

## Open decisions (do not implement — raise with Pencil)

None currently open.

Closed decisions (2026-08-06):

- Appliance/sink units keep **dedicated codes** — `BSK` (sink), `UBO`
  (under-bench oven, supersedes `BOV`), `WOT` (wall oven tower, supersedes
  `TOV`). Per the never-reuse rule, `BOV`/`TOV` are retired.
- Tall codes carry **no height-band token** — heights from room/job settings,
  prompt if the plan is silent.
- Island bench back panels are `IBPF`/`IBPK`; wall fillers are `WF`/`WFW`.
