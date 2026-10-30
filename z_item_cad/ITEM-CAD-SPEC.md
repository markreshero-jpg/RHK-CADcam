# Item CAD — CAD attached to library items

**Status:** IC1 + IC2 built 2026-10-25 (checked headless, in-app checks pending). IC3a (Side + Top tabs, cabinet sheet prints) built 2026-10-30, checked headless (modal), in-app check pending. Next: rest of IC3 (plan canvas + other prints).

CAD notes (the F7 tools) that belong to a library item, not a room: whenever
the item comes out of the library, its CAD draws with it. First use: "PULLOUT BIN"
on every bin front in elevation.

Builds on: CAD blocks + live fields (`z_CAD_tool/ANNOTATION-SPEC.md` phase C,
`src/lib/annotations/blocks.ts`), elevation CAD (A6a), cabinet sheets CAD (A7, not
built), display layers (`z_display_layers/DISPLAY-LAYERS-SPEC.md`), job pinning
(Cabinet Vision-style static jobs, "Update job").

## Locked (Mark, 2026-10-25)

1. **Bin note hangs off the bin front.** Owners can be a front type (e.g. bin), so every
   cabinet whose front resolves as a bin (BBIN, BBIN+I1, future bin cabs) gets it,
   placed on that front. Cabinet definitions and fixture models can also own item CAD.
2. **Fixed size.** Text stays the same paper size at any scale and any cabinet width;
   it sits on an anchor (e.g. centre of the front) so it stays put as the item resizes.
3. **Drawn in the Cabinet Edit modal.** F7 in the modal's **Elevation** tab = CAD for
   elevations; F7 in the **Top** tab = CAD for plan. Same tools and ribbon as the room
   canvas. (Side tab: later, for cabinet sheets.)
4. **No silent job updates.** Changing item CAD in the library does **not** change jobs
   already drawn. A job keeps the version it first used until an explicit
   **Update job**. Mark: this applies to all library changes going forward.
5. **Fixtures get an edit window** (Mark, 2026-10-25): reuse the Cabinet Edit modal's
   views (Top / Side / Elevation…) for fixtures, so fixture item CAD is drawn the same
   way as cabinet item CAD (phase IC6).

## Defaults (Claude, 2026-10-25; Mark to overrule)

- **Save target.** The modal edits a placed cabinet, so finishing CAD there asks where it
  goes: **This cabinet only** (stays in the job), **Library: this front type** (e.g. bin
  front, offered when a selected note sits on a front), or **Library: this cabinet code**.
- **Anchor per note.** Snapped to the nearest of 9 points (corners, edge mids, centre) of
  the thing it's attached to (the front's box, or the cabinet's front / top box). Offsets
  are in paper mm, so text never stretches or drifts with the cabinet's size.
- **Optional stretch** (not needed for the bin note, so it comes later): lines /
  shapes may be set to scale with the item's W×H (e.g. a corner-to-corner cross).
- **Item fields.** Live tokens filled from the item: `{bin}` (e.g. "Nikpol Teramo 74L"),
  `{code}`, `{w}`, `{h}`, `{d}`, `{label}`. Job / room fields keep working too.
- **Mirror.** Mirrored / back-side items mirror the anchor points; text never reads backwards.
- **Display layer.** New registry item `item_cad` ("Item CAD", group annotations, views
  plan + elevation, default on). All drawing goes through the layer API.
- **Per placed item:** **Hide item CAD** (hides it on that one item) and **Detach**
  (makes it ordinary room notes, editable for that job only).

## Pinning (decision 4)

- `library_cad` rows (owner kind + owner id, view `elevation` | `plan`, items jsonb in
  the CAD block format + anchor per item, `version`). Library RLS: read all, admin write.
- The first time a job draws an owner's item CAD, that version is **copied into the job**
  (`job_item_cad`: project id + library_cad id + version + items). Every item in the job
  draws from the job copy. A front changed to a bin later in the same job uses the job
  copy if there is one, else copies the library's current version then.
- **Only item CAD that existed when the job started** (library row `created_at` ≤
  project `created_at`) is copied by itself (Claude, 2026-10-25, so new library CAD can't
  appear in old jobs on their next open). Newer item CAD reaches an existing job through
  Update job, or by moving notes to the library from inside that job (that job's copy is
  written with the library). Known gap: no version history, so a job opened for the first
  time after a library edit gets the edited version.
- Edit / Remove never delete a library row (that would cascade away jobs' copies): Remove
  empties its items and bumps the version; Edit brings the notes back onto the cabinet
  and empties the row until they're moved back.
- **Update job** (first piece of the general Update job feature): lists library item CAD
  newer than the job's copies → tick → refresh. Same screen to take the other library
  changes later, once they're pinned too.
- Note: most library data (materials, schedules, hardware, cabinet definitions) still
  resolves live today. Pinning that is the separate job-version project; item CAD is
  built pinned from day one.

## Where it draws

Elevation canvas, Elevation Views PDF, shop drawings, cabinet sheets (front / plan),
the Cabinet Edit modal views. Plan canvas + Plan View PDF for `plan` attachments. One
renderer (`AnnotationLayer`), with notes placed into each view's frame through the anchors.

## Phases

| Phase | Scope | Status |
|---|---|---|
| IC1 | `library_cad` + `job_item_cad` tables; F7 CAD in the Cabinet Edit modal Elevation tab; save target picker (cabinet only / front type / cabinet code); anchors; draw on the elevation canvas from the job copy | [x] built 2026-10-25, see IC1 notes; checked headless, in-app check pending |
| IC2 | Item fields (`{bin}`, `{code}`…), Hide / Detach per placed item; seed "PULLOUT BIN" on the bin front (Mark to draw it — the test one was removed) | [x] built 2026-10-25, see IC2 notes; checked headless, in-app check pending. PULLOUT BIN not seeded: Mark draws it |
| IC3a | CAD on the modal's **Side** and **Top** tabs (Mark, 2026-10-30, for the bi-fold track detail): own drawing per tab, library view `side` / `plan` on the cabinet code; **cabinet sheets** print Front / Side / Plan notes | [x] built 2026-10-30, see IC3a notes; in-app check pending |
| IC3 | Top tab notes on the plan canvas + Plan View PDF; prints: Elevation Views PDF, shop drawings | [ ] |
| IC4 | Update job (item CAD part): newer-version list + refresh | [ ] |
| IC5 | Library view of attachments (list / edit / remove without a room), optional stretch | [ ] |
| IC6 | Fixture edit window: the Cabinet Edit modal's view shell (Top / Elevation / Side) for a fixture, F7 CAD in it, fixture models as owners (decision 5) | [ ] |

## IC1 notes (2026-10-25)

- Migration `item_cad_ic1` applied live (`migration_ic1_item_cad.sql`): the two tables +
  `room_annotations.sheet_view` allows `'top'`.
- Pure: `src/lib/annotations/itemCad.ts` (anchors, to/place items, pinning helpers; tests
  `src/lib/__tests__/itemCad.test.ts`). Owner `cabinetSheetOwner(cabId, 'front' | 'top' |
  'side')` in `owner.ts`; cabinet front frame = x from the cabinet's left, y down from
  its bottom (heights negative, like elevations).
- `useItemCad.ts` (canvas): loads library + job rows, pins, targets per cabinet (bin
  fronts from `drawer_stacks` with `drawer_type 'bin'`, cabinet code = definition name),
  `frontNotes(cab)` = the cabinet's own notes + placed library notes.
- `CabinetCad.tsx` (`useCabinetCad`): the CAD tool on the modal's Elevation view
  (`ResolvedElevation` `cad` host prop: svg + screen scale + overlay, ignores its own
  clicks while on). CAD tools left of the view, CAD panel over the properties panel,
  Item CAD bar above (Move to library / Edit / Remove). Dashed cyan boxes = targets.
  The canvas's own CAD stands down while the modal is open; Ctrl+Z inside the modal is
  still shielded (undo after closing it).
- Room elevation: `ElevationSVG` draws `itemCadNotes(cab)` inside each cabinet's group,
  gated by the new `item_cad` layer (Annotations group, elevation, default on).
- Tutorial `item_cad` (events `item_cad_on`, `item_cad_moved`).
- Headless check (`z_plan_automation/verify-item-cad.mjs`, RHK1234 Kitchen Test Room):
  text typed in the modal, moved to Bin front, drawn on the room elevation; Edit brought
  it back selected, Move again, Remove emptied the row. Not yet: prints (IC3), canvas
  undo of a Move, back-side elevations.

## IC2 notes (2026-10-25)

- **Item fields** (`ITEM_CAD_FIELDS` in `itemCad.ts`): `{bin}` (the bin product on that
  front, brand + name; a note on the cabinet code / the cabinet's own notes list all its
  bins, "2 x …" for repeats), `{code}` (definition name), `{label}` (e.g. BC-05), `{w}`
  `{h}` `{d}`. Filled per cabinet + target in `useItemCad.frontNotes` / the modal; stored
  as tokens (Edit / Detach bring tokens back). The CAD panel's Fields list shows them
  under "This cabinet" above the job / room fields when drawing on a cabinet.
- **Hide here / Show here** and **Detach** in the modal's Item CAD bar. Stored on the
  cabinet: `cabinet_instances.item_cad_hidden text[]` of owner ids (`front_type:bin`,
  `cabinet_def:<id>`), migration `item_cad_ic2_hidden` (`migration_ic2_hidden.sql`),
  written straight to the row (no re-resolve) with an undo snapshot. Hidden notes are
  ghosted in the modal, not drawn on the room elevation. Detach = copy every front of
  that owner's notes onto the cabinet as its own + hide the owner.
- Headless check `z_plan_automation/verify-item-cad-ic2.mjs` (RHK1234 test room, BC-09):
  "PULLOUT BIN / {bin}" → "Nikpol Teramo 74L" on the room elevation; Hide → gone;
  Show + Detach → drawn once (own copy); cleans up after itself.
- The `item_cad` display layer was done in IC1.

## IC3a notes (2026-10-30)

- **Why:** Mark wanted a dimensioned detail of the bi-fold track (z_bifold_slide) on
  the cabinet. That's drawn on the Side view, and the Side tab had no CAD.
- **Database:** `library_cad.view` now allows `side` (`migration_ic3a_side_view.sql`,
  applied). `room_annotations.sheet_view` already took front / top / side.
- **Library view per tab:** front = `elevation`, top = `plan`, side = `side`
  (`sheetItemCadView` / `itemCadViewSheet` in `itemCad.ts`).
- **Frames** (owner.ts):
  - top: x from the left, y from the back;
  - side: x from the back, y down from the bottom.
- **Targets:** `cabinetItemCadTargets(…, sheet)` gives the cabinet code's box in that
  frame. Bin fronts are front only.
- **Modal** (`CabinetEditModal`): one `useCabinetCad` per tab (`sheet` front / top /
  side). The CAD button and F7 work on Elevation, Top and Side.
- **Views:** each view reports its frame origin through the CAD host (`onOrigin`), so
  the hook doesn't hard-code paddings. `ResolvedTop` / `ResolvedSide` take `cad` like
  `ResolvedElevation`.
- **Snaps on Top / Side:**
  - the cabinet outline;
  - every carcass panel (`caseBox`);
  - the doors;
  - the bi-fold tracks (Side: the end profile).
- **CadPanel:** the `sheet` prop gives the axes caption. Top reads Y from the back, not
  Z up.
- **Cabinet sheets** (`CabinetSheetSVG` `cadNotes`):
  - Front, Side and Plan each draw the cabinet's own notes plus library item CAD.
  - Library notes are placed at that view's paper scale (`frontNotes(cab, view, k)`,
    k = 1 / view scale), so text keeps its paper size.
  - A "CAD notes" toggle (on by default).
  - `CabinetSheetReport` runs `useItemCad` (the job's pinned copies) and waits for it
    before a batch download.
  - `ReportsModal` passes the print-ready room rows + fields.
  - The sheets also draw the bi-fold tracks.
- **Tests:** `itemCad.test.ts`, IC3a block.
- **Headless check** (2026-10-30, RHK1234 test room, T2D/BF, deleted afterwards):
  - the Side tab took a note, and the panel read "Side · X from the cabinet's back";
  - the track profile drew under the top behind the door (Side) and across the width
    (Top).
- **Not yet:** the printed cabinet sheet wasn't opened headless.
- **Tutorial:** `item_cad_side_top`.
