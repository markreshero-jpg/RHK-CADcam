# RHK CADcam — Shape Editor
## Handoff for Claude Code

A 2D profile editor for cabinet parts, built in React. Produces a closed
segment loop in part-relative millimetres, ready for the resolver.

**Files**

| File | Purpose |
|------|---------|
| `ShapeEditor.jsx` | The component. Drop straight in. |
| `cad-editor.html` | Standalone test harness — open in Chrome, no build step |
| `SHAPE_EDITOR_README.md` | This document |

No npm dependencies beyond React.

---

## Scope — read this before starting

**Phase 1 is Part Editor only.** Integrate the Shape Editor into the existing
`app/canvas/[roomId]/PartEditor.tsx`. That component is load-bearing — extend
it, do not rebuild it.

**Do not yet build:** cabinet-level shape editing, benchtop shapes, annotation
layers, or any integration outside `PartEditor`.

**Do not modify the internals of `ShapeEditor.jsx`.** Geometry routines
(`healAndClose`, `arcCentre`, `concentricArc`, `doTrim`) are unit-tested and
easy to break subtly. Tool behaviour changes are made in the Claude chat
session and handed over as a replacement file. Claude Code's job here is
mounting, wiring, and persistence.

---

## Integration

```
components/ShapeEditor/ShapeEditor.jsx
```

```jsx
import ShapeEditor from '@/components/ShapeEditor/ShapeEditor'

<ShapeEditor
  partWidth={part.size_dx}
  partHeight={part.size_dy}
  partLabel={part.name}
  initialSegments={part.shape_segments}      // null on first edit
  onSave={handleSave}
  onCancel={() => setEditingShape(false)}
/>
```

The component has `'use client'` and manages its own state. It fills its
container — mount it in a panel or modal within `PartEditor`, not as a
full-page route.

---

## Props

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `partWidth` | number (mm) | `600` | Part DX. Drawn as the reference boundary. |
| `partHeight` | number (mm) | `720` | Part DY. |
| `partLabel` | string | `'Part'` | Shown in the header. |
| `initialSegments` | array \| null | `null` | Part-relative mm. `null` seeds the part rectangle. |
| `onShapeChange` | fn | `null` | `(segmentsMM, meta)` on every edit. Use for autosave/dirty state. |
| `onShapeConfirmed` | fn | `null` | `(segmentsMM, meta)` when **Check Shape** passes. |
| `onSave` | fn | `null` | `(segmentsMM, meta)` — only fires on a valid closed shape. |
| `onCancel` | fn | `null` | User exited without saving. |
| `readOnly` | bool | `false` | **Declared but not enforced yet** — see Known Gaps. |

`onSave` and `onCancel` control whether the Save / Exit buttons appear.
Omit them and the editor runs standalone.

---

## Segment format

This is what you persist. Coordinates are **part-relative millimetres** —
`0,0` is the part datum.

```js
// Straight edge
{ type:'line', p0:{x,y}, p1:{x,y}, edge:{ band:false, profile:'square' } }

// Circular arc
{ type:'arc', p0:{x,y}, p1:{x,y}, rx, ry, largeArc:0|1, sweep:0|1, edge:{...} }

// Bezier
{ type:'curve', p0:{x,y}, p1:{x,y}, cp1:{x,y}, cp2:{x,y}, edge:{...} }
```

`edge.profile` is one of: `square`, `bullnose`, `chamfer`, `ogee`, `pencil`.
`edge` is authored in PartEditor, not here — see below.

Segments arrive **ordered** and **counter-clockwise**, and consecutive
endpoints are exactly equal — `segs[i].p1` deep-equals `segs[i+1].p0`. The
resolver can walk the array directly without re-sorting.

## Edge banding is NOT edited here

The shape editor **displays** edge banding but never authors it. Banding is a
Part-level (L4) property and belongs in **PartEditor**, because most parts are
plain rectangles that need banding decisions but never need shape editing.

What the shape editor guarantees:

- The `edge` object on every segment is **passed through untouched** —
  including across Heal & Close, which reorders and reverses segments
- Banded edges are drawn as coloured tape on the outside face, read-only
- `meta.bandedEdges` and `meta.tapeLengthMM` are reported for convenience

**Do not build banding UI into the shape editor.** Build it in PartEditor.

### Splitting a rectangle from a shaped part

The two cases need different UI, and the difference is not cosmetic:

- **Rectangular parts** have four edges that need a fixed naming convention
  (front / back / left / right, mapped to the DX and DY axes). A simple
  four-toggle diagram is the right control.
- **Shaped parts** have an arbitrary segment list where direction is carried
  by the geometry itself. No naming convention is needed — but the UI has to
  handle N edges.

### Why the axis matters

Edge tape has thickness, so a banded panel must be **cut undersize** to
finish at its nominal dimension. A 600 mm gable banded on both DX edges with
1 mm tape has to be cut at 598 mm. The resolver can only apply that deduction
if it knows which axis the banded edges run along — "three edges are banded"
is not enough information. The same applies when the nester rotates a part:
the deduction has to rotate with it.

### Tape thickness lives in the material schedules

Thickness is **not** stored on the segment. It resolves from the existing
material schedules:

- Doors and fronts → `door_material_schedules`
- Assembly parts → `assembly_material_schedules`

The segment carries only `band` (whether this edge is taped) and `profile`
(the edge treatment). Everything dimensional comes from the schedule, so
there is a single source of truth for a given tape spec.

### One gap to watch

Because the tag lives on the segment object, splitting or trimming an edge
carries the tag onto both halves, and Heal & Close preserves it. But if a user
**deletes** an edge and draws a replacement, the new segment comes back
untagged and nothing warns them. Worth surfacing an "N edges have no banding
specified" check in PartEditor before a part goes to production.

## `meta` object

```js
{
  closed: true,
  segmentCount: 6,
  bounds: { minX:0, minY:0, maxX:600, maxY:720 },   // mm
  originShift: { dx:0, dy:0 },                       // see Datum below
  bandedEdges: 3,
  tapeLengthMM: 1840,
}
```

`onShapeChange` sends a reduced meta (`closed`, `segmentCount` only).
`onSave` and `onShapeConfirmed` send the full object.

---

## Datum (X0 Y0) — important

Shape coordinates are relative to the part datum. An existing part already has
a datum that positions it inside the cabinet, and **that datum must be
preserved** across an edit.

If the user draws geometry at negative coordinates, the datum no longer sits
at the shape's minimum corner. The editor detects this, flags it red, and
offers **Re-reference datum to 0,0**, which translates the geometry so the
minimum corner lands on `0,0`.

When that happens the part must move in the opposite direction to stay in the
same place in the world:

```js
function handleSave(segsMM, meta) {
  const { dx, dy } = meta.originShift;
  if (dx || dy) {
    // Datum moved by (dx,dy) — compensate the part's placement by the inverse
    updatePartPosition(part.id, {
      pos_x: part.pos_x - dx,
      pos_y: part.pos_y - dy,
    });
  }
  savePartShape(part.id, segsMM, meta);
}
```

**Skipping this compensation will silently move parts in the cabinet.**
`originShift` is cumulative for the editing session and is `{dx:0, dy:0}` when
nothing moved.

---

## Closure is mandatory

A part profile must be an exactly closed loop — every joint an exact
coordinate match, not "within tolerance". Open outlines cannot be resolved
into toolpaths.

Pressing **Save Shape** on an open outline opens a blocking dialog with three
options: *Heal & Close then save*, *Keep editing*, or *Exit without saving*.
`onSave` therefore **only ever fires with a valid closed shape** — you do not
need to re-validate before writing to the database.

**Heal & Close** does three things:

1. **Weld** — snaps near-coincident endpoints to a single shared coordinate.
   Deterministic: prefers a grid-aligned point, never averages (averaging
   would shift geometry and corrupt typed dimensions).
2. **Order** — walks segments into one continuous chain, reversing any drawn
   backwards.
3. **Wind** — normalises closed loops counter-clockwise so the resolver always
   knows which side is outside.

It is idempotent — running it twice changes nothing.

---

## Supabase

Suggested columns on the part record:

```sql
alter table parts
  add column shape_segments   jsonb,
  add column shape_valid      boolean not null default false,
  add column shape_updated_at timestamptz;
```

- Write `shape_segments` and set `shape_valid = true` in `onSave`
- `onShapeChange` is for dirty-state / autosave drafts, **not** for setting
  `shape_valid` — mid-edit shapes are usually open
- A `null` `shape_segments` means "part is a plain rectangle", which the
  resolver should already handle. Only write a shape once it differs.

Keep this append-only-friendly: shape edits on a signed job should follow the
existing job-revision rules rather than mutating in place.

---

## Tools

**Draw** — Line (L), Polyline (P), Rectangle (R), Circle, Oval, Triangle
**Edit** — Select (S), Move Line, Move Vertex, Set Length
**Modify** — Bend, Fillet, Chamfer, Offset, Trim, Add Point, Delete

Snapping: 10 mm grid, 22.5° angles, and magnetic endpoint snap. Hold **Shift**
for freehand. Segments do not auto-connect — drawing is deliberately freehand,
and Heal & Close reconciles it at the end.

**Set Length** — click a line, choose which end stays fixed, type the exact
mm. Connected neighbours stretch to follow.

**Import SVG** — converts paths, lines, rects, circles, ellipses, polylines
and polygons into editable segments. Grouped transforms are applied.

---

## Known gaps

Be aware of these; do not try to fix them in `ShapeEditor.jsx`.

- **`readOnly` is not enforced.** The prop exists but tools remain live. If
  you need a read-only view now, wrap the component and block interaction at
  the container level.
- **Set Length only works on straight lines**, not arcs.
- **Arc-to-arc trimming is unsupported** — line-arc works.
- **Winding uses a chord approximation** for arcs. Correct for typical
  profiles; a shape dominated by large arcs could theoretically mis-detect.
- **No mirror tool, no copy/paste, no perimeter/area readout** — planned for a
  later stage.
- **Undo/redo covers geometry only**, not zoom/pan.

---

## Testing before you wire it up

Open `cad-editor.html` in Chrome. It mounts the editor with a 600 × 720 mm
"Left Gable" **seeded with existing edge banding**, exactly as PartEditor
would supply it. Draw or reshape, hit Save, and inspect the emitted payload
in the console — confirm the `edge` objects come back intact. That payload is
exactly what `onSave` will hand you.
