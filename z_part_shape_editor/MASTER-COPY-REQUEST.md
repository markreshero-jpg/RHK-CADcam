# Shape Editor — Master Copy Change Request (batch 1)

> **How to use this doc**: paste it into the design chat that owns `ShapeEditor.jsx`.
> Deliverable is **one replacement `ShapeEditor.jsx`** with the changes below.
> Everything else about the component contract (props, segment format, `meta`,
> Heal & Close, Save/closure flow) stays as documented in `SHAPE_EDITOR_README.md`.
> Geometry routines (`healAndClose`, `arcCentre`, `concentricArc`, `doTrim`) must
> not change.
>
> Requested by Claude Code integration session, 2026-07-29. Context: the component
> is mounted and working end-to-end in the app (full-screen overlay above the Part
> Editor); these changes let it mount **natively inside** the Part Editor window and
> support cabinet-level shaping (see it against neighbouring parts), Cabinet-Vision
> style.

---

## 1. Size from the container, not the window — **required, blocks everything else**

Today the canvas dimensions are computed at **module scope**:

```js
// near the top of the file
const W = Math.min(window.innerWidth - 260, 1800);
const H = Math.min(window.innerHeight - 120, 1200);
```

and the root div is hard-coded to the viewport:

```js
<div style={{background:'#f0efea', ..., height:'100vh'}}>
```

Consequences in the app: the component can only ever be a full-screen overlay
(it claims the viewport wherever it's mounted), and the module-scope `window`
reads crash SSR, forcing a `next/dynamic ssr:false` workaround.

**Requested**: root div `height:'100%'` / `width:'100%'`; canvas W/H derived from
the actual container size via a `ResizeObserver` on the root (state, not module
constants), so the editor fills whatever panel it is mounted in and re-fits when
that panel is resized. No `window.innerWidth/innerHeight` reads at module scope
(inside effects is fine as a fallback). Zoom/pan/snap math is unaffected — only
where W/H come from changes.

## 2. `hideChrome` prop (embedded mode)

When the editor mounts inside the Part Editor, the Part Editor already has a
header; the component's own top bar (part label + Check Shape / Save / Exit row)
duplicates it and makes it read as a separate program.

**Requested**: a `hideChrome: bool` prop (default `false`, current behaviour
unchanged). When `true`:

- the internal header row is not rendered — the **left tool rail stays** (that's
  the CAD toolset we want inside the app);
- the host needs a way to trigger the same save/exit flows the header buttons
  run. Suggested: expose an imperative handle via `forwardRef` /
  `useImperativeHandle` with `requestSave()` and `requestExit()` that run the
  exact same code paths as the buttons — including the blocking
  Heal-&-Close-then-save dialog on an open outline. The guarantee that `onSave`
  only ever fires with a valid closed shape must hold regardless of which side
  owns the buttons. (If you prefer a different mechanism to a ref, fine — state
  the contract in the README section of the file header.)

Validation banners, the heal dialog, and the coords readout all stay — only the
top chrome row is suppressed.

## 3. Dark theme

The component is light-themed (`#f0efea` canvas chrome, `#fafaf7` panels,
IBM Plex Mono on near-white) while the entire host app is dark grey. This is
the single biggest "different program" tell.

**Requested**: either restyle to a dark palette outright, or add a
`theme: 'light' | 'dark'` prop (host will pass `'dark'`). Host palette for
reference (Tailwind greys):

| Role | Hex |
|---|---|
| App background / deepest | `#111827` |
| Panel background | `#1f2937` |
| Borders / dividers | `#374151` |
| Primary text | `#d1d5db` |
| Secondary text | `#9ca3af` |
| Selection / accent blue | `#0284c7` |

Keep the drawing canvas itself slightly lighter than the panels if that helps
line contrast — your call on the exact values; the tool colours (error red,
warn amber, confirm green, banding tape) just need to keep AA contrast on the
new backgrounds.

## 4. Relax the part-bounds check (agreed behaviour change)

Locked integration decision: **the shape may be drawn any size; on save, the
part's resolved size becomes the shape's bounding box** (the app writes size
overrides from `meta.bounds`). The current `checkGeometry` blocks that for the
grow case:

```js
if (maxX > partW + 1)
  issues.push({type:'error', msg:`Shape is ${maxX-partW}mm wider than the part (${partW}mm)`});
if (maxY > partH + 1)
  issues.push({type:'error', msg:`Shape is ${maxY-partH}mm taller than the part (${partH}mm)`});
```

Since `attemptSave` blocks on errors, shapes larger than the part rectangle
cannot be saved — only shrink-or-equal works today.

**Requested**: downgrade these two from `error` to a non-blocking `warn`-class
notice with grow-aware wording, e.g.
`Shape is larger than the current part — part will become 640 × 780 mm on save`.
The part reference rectangle stays drawn as-is.

**Keep unchanged**: the negative-origin check
(`Shape extends outside the part origin`) and the red-flag →
**Re-reference datum to 0,0** flow. That one is load-bearing — the host
compensates part placement from `meta.originShift` and needs geometry to end
up at non-negative coordinates.

## 5. `referenceOutlines` prop (shape against neighbouring parts)

For cabinet-level shaping we want the user to see adjacent parts while editing —
the benchtop line above a gable, the neighbouring gable, the kick — like
Cabinet Vision's in-context part shaping. The host computes these outlines
(projected into the part's own frame); the editor just needs to display them.

**Requested**: a new prop

```js
referenceOutlines: [
  { label: 'Benchtop', segments: [ /* same segment format, part-relative mm */ ] },
  ...
] | null
```

Rendered as faint dashed ghost geometry (e.g. 30–40 % grey) **behind** the
editable shape and the part rectangle, with the label drawn small near the
outline. Strictly read-only: not selectable, not hit-testable, not snap
targets, ignored by Heal & Close / checkGeometry / undo history, never emitted
in `onSave`. They live in the same part-relative mm frame and transform with
zoom/pan like everything else.

(Endpoint snapping **to** reference outlines is deliberately out of scope for
this batch — flag it as a possible later flag if it's cheap to leave a hook.)

## 6. Housekeeping: duplicate `tabIndex`/`onKeyDown` on the `<svg>`

The delivered file had the `tabIndex` and `onKeyDown` attributes twice on the
main `<svg>` element. React uses the later pair, but TypeScript builds fail on
it (TS17001), so the integration copy had the earlier (shadowed) pair removed —
behaviour identical. **Apply the same dedup to the master copy** so the next
replacement file doesn't reintroduce the build break.

---

## Not requested / please don't

- No banding authoring UI (still PartEditor's job; `edge` passes through untouched).
- No changes to the segment/`meta` emit format — persistence is already live
  against it.
- No new tools; no geometry-routine changes.

## How the host will mount it after this lands

Part Editor centre pane swaps between the 3D/ortho view and the shape editor
(same window, same header, host-owned Save/Exit calling `requestSave()`);
cabinet 3D right-click → Edit Shape opens the same thing with
`referenceOutlines` populated from the neighbouring parts. The full-screen
overlay wrapper goes away.
