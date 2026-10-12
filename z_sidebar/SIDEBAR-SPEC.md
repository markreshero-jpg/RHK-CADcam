# Canvas sidebar — section pattern (LOCKED 2026-10-12)

File: `app/canvas/[roomId]/CanvasSidebar.tsx`.

## Locked decisions

1. **Every tool section uses the shared primitives** — `SectionHeader`,
   `SectionBody`, `ToolRow`, with a `Tone` from `TONES`. This applies to Wall
   (F2), Cabinet (F3), Benchtop (F4), Paste, and **any section added later**
   (decorative items, appliances, …). No hand-rolled header/row styling.
   To add a section: add a `TONES` entry, a header with `open` / `active` /
   `summary`, and a body of `ToolRow`s.
2. **States**
   - Open section → tone-tinted header with a tone outline + bar, F-key badge lit,
     tone rail down the body.
   - Active (its tool is the current mode) → solid tone header; `summary` shows
     the current tool / armed item under the label so it's visible collapsed.
   - Active row → tinted bg + tone bar + ✓.
   - **Select never highlights** — it is the resting mode, so lighting it would
     always show something lit. It stays as a mouse shortcut for Esc.
3. **One section open at a time.** Enforced in the sidebar by an effect that
   closes the others when any menu flips open (covers F-keys in CanvasClient).
   A new section's open flag must be added to that effect.
4. **Cabinet library = drill-down, not an accordion.** Top level = one tile per
   root category (pictogram by name, colour = `accent_color` else `CAT_PALETTE`
   by root order, inherited by sub-categories). Inside a category: breadcrumb
   (ancestors clickable + back), sub-category rows (›, recursive count), then
   cabinets. Only one level is ever shown. Search switches to a flat hit list
   with each hit's path.
5. **Armed cabinet path is lit**: tiles / sub-category rows containing the armed
   cabinet get a blue ring/dot; the armed row is solid blue with ✓. Only while
   `mode === 'place_definition'`.
6. **Reopen where you left off**: drill-down position persists in
   `localStorage['rhk-sidebar-cab-nav']` (per-browser convenience only, not the
   old localStorage *groups*, which stay removed per the Cabinet Library spec §4).
   A stale id (deleted category) falls back to the top level.
7. **F-keys and headers are identical and only toggle the menu** (decided
   2026-10-12). F2 / F3 / F4 key == clicking that header == open/close that
   section. They never change the mode on their own: a section lights solid
   only once one of its tools is picked. F4 no longer enters Benchtop mode —
   that's the "Select Tops" tool (`benchtop_select`) in the menu; Esc or
   Select leaves it.
8. **Menus stay open** until their key/header is pressed again or another
   section opens. Canvas clicks, Esc, picking a tool and finishing a benchtop
   do not close them.

## Status
- Done: primitives, Wall/Cabinet/Benchtop/Paste migrated, drill-down, exclusivity.
- Future: cabinet cards with a mini front-elevation sketch were considered and
  deferred (option "tabs + card grid").
