// Hand-written declarations for the handed-over ShapeEditor.jsx (whose
// internals are off-limits — see z_part_shape_editor/SHAPE_EDITOR_README.md).
// Without this file TS infers each prop's type from its JS default value
// (e.g. `initialSegments = null` → type null), rejecting every real call site.
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
}

declare function ShapeEditor(props?: ShapeEditorProps): JSX.Element
export default ShapeEditor
