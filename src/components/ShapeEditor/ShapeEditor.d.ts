// Hand-written declarations for ShapeEditor.jsx. (Ownership note: originally
// the internals were design-chat-only; as of M7 (2026-08-01, Mark's call) the
// component is maintained in-repo.) Without this file TS infers each prop's
// type from its JS default value (e.g. `initialSegments = null` → type null),
// rejecting every real call site.
//
// The segment/meta shapes mirror ShapeSegment / ShapeMeta in
// app/canvas/[roomId]/canvasDB.ts structurally (kept separate so src/ never
// imports from a route folder). If the emit format changes upstream, update
// BOTH files.

export interface ShapeEditorSegment {
  type: 'line' | 'arc' | 'curve'
  p0: { x: number; y: number }
  p1: { x: number; y: number }
  cp1?: { x: number; y: number }
  cp2?: { x: number; y: number }
  rx?: number
  ry?: number
  largeArc?: 0 | 1
  sweep?: 0 | 1
  edge?: { band?: boolean; profile?: string }
}

export interface ShapeEditorMeta {
  closed: boolean
  segmentCount: number
  bounds?: { minX: number; minY: number; maxX: number; maxY: number } | null
  originShift?: { dx: number; dy: number }
  bandedEdges?: number
  tapeLengthMM?: number
}

// A ghost outline of a neighbouring part, in the same part-relative mm frame
// as the shape. Display-only inside the editor.
export interface ShapeEditorReferenceOutline {
  label?: string
  segments: ShapeEditorSegment[]
}

export interface ShapeEditorProps {
  partWidth?: number
  partHeight?: number
  partLabel?: string
  initialSegments?: ShapeEditorSegment[] | null
  onShapeChange?: ((segmentsMM: ShapeEditorSegment[], meta: ShapeEditorMeta) => void) | null
  onShapeConfirmed?: ((segmentsMM: ShapeEditorSegment[], meta: ShapeEditorMeta) => void) | null
  onSave?: ((segmentsMM: ShapeEditorSegment[], meta: ShapeEditorMeta) => void) | null
  onCancel?: (() => void) | null
  readOnly?: boolean
  // Embedding (M7): hide branding + Save/Exit (host owns them via the ref
  // handle); the utility strip and tool rail stay.
  hideChrome?: boolean
  referenceOutlines?: ShapeEditorReferenceOutline[] | null
}

// Imperative handle (forwardRef): host-owned Save/Exit run the same flows as
// the header buttons (closed-shape gate + heal dialog included).
export interface ShapeEditorHandle {
  requestSave: () => void
  requestExit: () => void
}

declare const ShapeEditor: React.ForwardRefExoticComponent<
  ShapeEditorProps & React.RefAttributes<ShapeEditorHandle>
>
export default ShapeEditor
