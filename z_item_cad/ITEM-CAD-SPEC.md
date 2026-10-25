# Item CAD — CAD attached to library items

**Status:** spec drafted 2026-10-25, nothing built. Next: IC1.

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
| IC1 | `library_cad` + `job_item_cad` tables; F7 CAD in the Cabinet Edit modal Elevation tab; save target picker (cabinet only / front type / cabinet code); anchors; draw on the elevation canvas from the job copy | [ ] |
| IC2 | Item fields (`{bin}`, `{code}`…), `item_cad` display layer, Hide / Detach per placed item; seed "PULLOUT BIN" on the bin front | [ ] |
| IC3 | Top tab → plan attachments (canvas + Plan View PDF); prints: Elevation Views PDF, shop drawings, cabinet sheets | [ ] |
| IC4 | Update job (item CAD part): newer-version list + refresh | [ ] |
| IC5 | Library view of attachments (list / edit / remove without a room), fixture models as owners, optional stretch, tutorial | [ ] |

## Open

- Fixtures have no Cabinet Edit modal. Draw their item CAD in the fixture panel's
  elevation preview, or on the room elevation with "Attach to library item"? (IC5)
