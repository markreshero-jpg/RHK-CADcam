# RHK CADcam — Shape Editor
## Implementation Guide for Claude Code

---

## What This Is

A fully-featured 2D shape editor built in React for editing cabinet/part profiles in the RHK CADcam app. All dimensions are in millimetres. The editor produces a JSON array of segments that can be passed to the cabinet resolver.

---

## Files

- `ShapeEditor.jsx` — the complete component, ready to drop in
- `cad-editor.html` — standalone HTML version for testing in browser (open directly in Chrome)

---

## Integration Steps

### 1. Copy the file
```
cp ShapeEditor.jsx your-project/components/ShapeEditor/ShapeEditor.jsx
```

### 2. Use in a page
```jsx
// app/shape-editor/page.jsx
import ShapeEditor from '@/components/ShapeEditor/ShapeEditor'

export default function ShapeEditorPage() {
  return <ShapeEditor />
}
```

The component has `'use client'` at the top — no extra config needed for Next.js App Router.

### 3. No extra dependencies
Uses only React (useState, useRef, useCallback, useEffect). No npm installs needed.

---

## Adding Props (when you're ready)

The component currently has no props — it's self-contained. When integrating with the cabinet resolver, add these:

```jsx
// In ShapeEditor.jsx, change the function signature:
export default function ShapeEditor({
  initialSegments = null,    // load existing shape: array of segment objects
  onShapeChange = null,      // callback(segments) called on every change
  onShapeConfirmed = null,   // callback(segments) called when Check Shape passes
  width = null,              // override canvas width (default: fills window)
  height = null,             // override canvas height (default: fills window)
}) {
```

Then wire up `onShapeChange`:
```jsx
// Inside pushHistory():
function pushHistory(newSegs) {
  // ... existing code ...
  if (onShapeChange) onShapeChange(newSegs);  // add this line
}
```

And `initialSegments`:
```jsx
// Change the initial history state:
const [history, setHistory] = useState(initialSegments ? [initialSegments] : [DEFAULT_SHAPE]);
```

---

## Segment Data Format

The shape is an array of segment objects. This is what gets passed to the resolver.

```js
// Line segment
{ type: 'line', p0: {x, y}, p1: {x, y} }

// Arc segment (circular)
{ type: 'arc', p0: {x, y}, p1: {x, y}, rx: number, ry: number, largeArc: 0|1, sweep: 0|1 }

// Bezier curve
{ type: 'curve', p0: {x, y}, p1: {x, y}, cp1: {x, y}, cp2: {x, y} }
```

All coordinates are in **pixels** internally (2px = 1mm). To convert to mm:
```js
const toMM = px => Math.round(px / 2)
const fromMM = mm => Math.round(mm * 2)
```

---

## Canvas Scale

| Setting | Value |
|---------|-------|
| Scale | 2px = 1mm |
| Minor grid | 10mm |
| Major grid | 100mm |
| Default snap | 10mm grid |
| Angle snap | 22.5° increments |
| Shift held | Freehand (no snap) |

---

## Check Shape — Geometry Validation

The **✓ Check Shape** button runs `checkGeometry(segments)` which returns:

```js
{
  valid: true|false,
  issues: [
    { type: 'error'|'warning'|'success', msg: 'string' }
  ],
  gaps: [
    { pt: {x, y}, segIdx: number, role: 'p0'|'p1' }  // unconnected endpoints
  ]
}
```

A shape is valid when:
- All endpoints connect (within 8px / 4mm tolerance)
- Shape forms a closed loop
- No zero-length segments
- Bounding box > 20px in both axes

---

## Tools Reference

### Draw Tools
| Tool | Key | Behaviour |
|------|-----|-----------|
| Line | L | Click start · move · Tab to lock length · Enter to place |
| Polyline | P | Click points · close on start point or ESC/double-click |
| Rectangle | R | Click corner · move · click to place |
| Circle | — | Click centre · move · click to place |
| Oval | — | Click corner · move · click to place |
| Triangle | — | Click 3 points · auto-closes |

### Edit Tools
| Tool | Key | Behaviour |
|------|-----|-----------|
| Select | S | Click to select · drag to multi-select |
| Move Line | — | Click to arm · move · click to place |
| Move Vertex | — | Click vertex · move · click to place |
| Set Length | — | Click line · type mm · Enter |

### Modify Tools
| Tool | Behaviour |
|------|-----------|
| Bend | Click line → curve. Click curve → straighten |
| Fillet | Click corner vertex to add radius |
| Chamfer | Click corner vertex to add chamfer |
| Offset | Click segment · move to set distance · click or type + Enter |
| Trim | Click segment piece to remove at intersections |
| Add Point | Click segment to split at midpoint |
| Delete | Click segment to delete |

### Right-click Menu
Right-click any segment for: Move, Bend/Straighten, Fillet, Chamfer, Add Midpoint, Set Length, Offset, Trim, Delete.

---

## Tab + Length Workflow

1. Select **Line** tool
2. **Click** on canvas to start the line
3. **Move mouse** to set the direction
4. **Press Tab** — angle locks, sidebar input activates with current length
5. **Type exact length** in mm — line preview updates on canvas
6. **Press Tab** again — blurs input, preview shows on canvas
7. **Press Enter** — line placed at exact length
8. **ESC** — cancel lock, back to freehand

---

## SVG Import

Click **⬆ Import SVG** in the header to import any SVG file as editable segments. Supports:
- `<path>` — all commands (M L H V C A Z and relative variants)
- `<line>`, `<rect>`, `<circle>`, `<ellipse>`
- `<polyline>`, `<polygon>`
- `<g>` groups with transforms

Imported geometry is scaled to fit the canvas and is immediately editable.

---

## Known Limitations / Future Work

- **No undo for zoom/pan** — undo/redo only covers geometry changes
- **Arc trim** — works on line-arc intersections; arc-arc intersections not yet supported
- **Dimension input on arcs** — set length only works on straight lines currently
- **Mirror tool** — not yet implemented
- **Export** — no direct export yet; access via `segs` state or `onShapeChange` prop
- **CADcam hierarchy levels** — shape editor operates at Assembly Level (Level 3); override rules to be wired up per the CADcam hierarchy spec

---

## Testing the HTML Version

Open `cad-editor.html` directly in Chrome to test all features before integrating. First load needs internet (fetches React from CDN). After that works offline.
