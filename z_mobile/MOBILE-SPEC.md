# Mobile (iPhone) canvas — spec

Status: **M1 built 2026-10-16, uncommitted, not yet checked on a real iPhone.**

## Goal

Make the room canvas usable on a phone for **viewing + light edits**: pan, zoom,
select, long-press menus (properties, delete, turn, move fixtures…), switch
plan / elevation / section / 3D. Drawing walls/benchtops and the detailed
cabinet editors stay desktop-first.

## Locked decisions

1. **Phone detection** — `useIsPhone()` in `src/lib/usePhone.ts`:
   `(pointer: coarse)` and the short screen side ≤ 600px. iPads and touchscreen
   laptops keep the desktop layout and the existing desktop-touch gestures.
2. **Zoom is the canvas's own pinch, not iOS page zoom.** Native page zoom would
   scale the toolbars with the drawing. The canvas page pins page scale
   (`viewport` export in `app/canvas/[roomId]/page.tsx`, `maximumScale: 1`) —
   this also stops iOS auto-zooming when a <16px panel input is focused.
3. **Finer lines** — canvas strokes are screen-pixel constant (`N / zoom`).
   Renderers divide strokes by a *line zoom* `lz = zoom / lineScale`
   (`useLineScale()`, `PHONE_LINE_SCALE = 0.6`). Text, dash lengths, handle
   radii and invisible hit strokes (`stroke="transparent"`) keep `zoom`, so tap
   targets don't shrink. Applied in CanvasSVG, ElevationSVG, SectionSVG,
   BenchtopElevation. New stroke code in those files must use `lz`.
4. **Gestures (phone only)** — in `usePinchZoom` (shared by plan, elevation and
   the modal viewBox editors):
   - one finger moved > 10px → pans the view; the view never sees the touch
     (no marquee, no drag-move on phones in M1)
   - tap → delivered as a normal pointerdown/up (select)
   - hold still 500ms → tap (select) + synthetic `contextmenu` at the finger,
     so every existing right-click menu works unchanged; the lift's click and
     any native contextmenu are swallowed for 600ms so the menu stays open
   - two fingers → pinch zoom + pan (unchanged)
   - **3D view** keeps OrbitControls' own touch (1 finger orbit, 2 finger
     pan/pinch); `useLongPressMenu` adds hold-still 500ms → synthetic
     `contextmenu` at the finger on the WebGL canvas, which r3f raycasts like a
     real right-click → cabinet menu on a cabinet, wall menu on empty space.
     Applies to all touch devices (no other right-click on touch in 3D).
   - **3D measure on phones**: ruler icon in the tab bar (3D view only; plan /
     elevation measure stay desktop). Tap face A, tap face B (no hover preview
     on touch); long-press clears (Measure3D listens for the synthetic
     contextmenu, and ignores the lifting finger as a pick); tap the icon again
     to exit (no Esc on a phone).
   - **No iOS text selection on long-press**: canvas root + cabinet edit modal
     carry `.touch-no-select` (globals.css, `(pointer: coarse)` only — inputs
     stay selectable, desktop mouse unaffected); both hooks also cancel
     `selectstart` while a finger is down and clear any selection when the menu fires.
5. **Layout (phone)** — compact menubar (one "Menu ▾" listing all groups),
   view tabs with short labels + ☰ button, sidebar as an overlay drawer
   (closes when a tool/library item is picked), right-hand panels stacked in a
   right-side drawer over the canvas (`min(18rem, 82vw)` wide) with an edge tab
   ◀/▶ to hide/show it — hiding is sticky across selections (user request
   2026-10-16, replaced the first-cut bottom sheet); slides via `right`, never a
   transform (would trap the fixed editors inside it), footer + snap toolbar hidden, root uses
   `h-dvh` so Safari's toolbar doesn't cut off the bottom.

6. **Panel ✕ closes, never deletes (all devices)** — the header ✕ on the
   cabinet / wall / benchtop / fixture properties panels used to delete the item.
   It now just deselects (`PanelCloseButton`); delete is a labelled red
   "Delete …" button at the panel foot (`PanelDeleteButton`). Del key and the
   right-click / long-press menus still delete. New properties panels follow this.

## Phases

- [x] **M1** — detection, viewport, finer lines, phone gestures, phone layout.
- [ ] **M1 check** — on a real iPhone (and `z_plan_automation/verify-mobile.mjs`
      once `AUTOMATION_*` creds are back in `.env.local`).
- [ ] **M2** — moving things by touch: drag a *selected* item to move it (pan
      elsewhere), and a "Move" item on the cabinet context menu.
- [~] **M3** — phone-friendly modals. **Cabinet edit modal done (2026-10-16):**
      full screen (`h-dvh`, no padding/rounding), view tabs scroll sideways,
      properties panel is a `min(15rem, 70vw)` drawer over the views with the
      shared `PhoneDrawerTab` ◀/▶; selecting a part re-opens a hidden drawer.
      The drawer starts below the header + tabs (measured `offsetTop` of the
      content area) so it never covers the close button, which is a 36px
      bordered line-icon ✕ on phones; the header title truncates instead of
      pushing ✕ off-screen. (Full screen = no backdrop to tap, so ✕ is the way out.)
      **3D part tap = compact card (floor staff use):** on phones `Cabinet3DView`
      gets `compactInfo`; tapping a part shows `PartInfoCard` across the top of
      the model — name, short description (detail / comment, else panel kind),
      Length × Width × Thick (same CV DY/DX/DZ + cut-size rule as
      PartPropertiesPanel), material name (fetched + cached per id), banded edges.
      Read-only; "Details" opens the full editing panel in the drawer as before.
      Still to do: reports + other modals, larger inputs (≥16px).
- [ ] Line-weight preference for desktop (reuse `useLineScale`).
