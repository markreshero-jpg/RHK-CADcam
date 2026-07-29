'use client'

// ============================================================
// Shape Editor overlay — mounts the handed-over 2D profile editor
// (src/components/ShapeEditor/ShapeEditor.jsx) full-screen above the
// Part Editor (z-[70] over its z-[60]). The .jsx component's internals
// are off-limits (geometry routines are hand-verified — replacement
// files come from the design chat); this wrapper owns mounting,
// frame mapping, and banding seed. Contract + locked decisions:
// z_part_shape_editor/SHAPE_EDITOR_README.md + INTEGRATION-PLAN.md.
//
// FRAME: the editor works in the part's UPRIGHT DISPLAY frame —
// partWidth = sw (across), partHeight = sh (up) — the same frame as
// the 3D box and PartEdge top/bottom/left/right semantics, so the
// bounding box maps 1:1 onto sw/sh size overrides and banding seeds
// straight from displayEdge. ShapeEditor's y grows DOWNWARD from the
// visual top-left; segments are persisted EXACTLY as it emits them
// (mm, y-down, CCW). SVG is y-down too, so stored paths render
// directly; op-frame consumers flip y at draw time (opY = sh − shapeY,
// plus the swap/mirror mapping ops already use).
//
// ShapeEditor.jsx reads window dims at module scope → ssr:false is
// mandatory, and it sizes itself to the viewport (100vh) → this
// overlay is always full-screen.
// ============================================================

import dynamic from 'next/dynamic'
import type { PartEdge } from '@/src/components/three/PartViewer'
import type { ShapeMeta, ShapeSegment } from '../canvasDB'

const ShapeEditor = dynamic(() => import('@/src/components/ShapeEditor/ShapeEditor'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
      Loading shape editor…
    </div>
  ),
})

// Seed a fresh part as its plain rectangle with banding tags mapped from the
// resolved EdgeBanding (display frame: y=0 is the visual top, so top ↔ y=0).
// Pass the mirror-adjusted displayEdge for right-hand twins. Tags are display-
// only here — banding is authored elsewhere; ShapeEditor passes `edge` through
// untouched (including across Heal & Close).
export function seedRectSegments(w: number, h: number, edge?: PartEdge): ShapeSegment[] {
  const tag = (band?: boolean) => ({ band: !!band, profile: 'square' })
  return [
    { type: 'line', p0: { x: 0, y: 0 }, p1: { x: w, y: 0 }, edge: tag(edge?.top) },
    { type: 'line', p0: { x: w, y: 0 }, p1: { x: w, y: h }, edge: tag(edge?.right) },
    { type: 'line', p0: { x: w, y: h }, p1: { x: 0, y: h }, edge: tag(edge?.bottom) },
    { type: 'line', p0: { x: 0, y: h }, p1: { x: 0, y: 0 }, edge: tag(edge?.left) },
  ]
}

export default function ShapeEditorOverlay({ partLabel, partWidth, partHeight, edge, initialSegments, onSave, onCancel }: {
  partLabel:  string
  partWidth:  number   // sw — upright display frame, across (mm)
  partHeight: number   // sh — upright display frame, up (mm)
  edge?:      PartEdge // displayEdge (mirror-adjusted) — seeds banding tape on a fresh rectangle
  // Latest saved shape (ShapeEditor emit format), or null/undefined for a fresh part.
  initialSegments?: ShapeSegment[] | null
  onSave:   (segments: ShapeSegment[], meta: ShapeMeta) => void
  onCancel: () => void
}) {
  const seeded = initialSegments && initialSegments.length > 0
    ? initialSegments
    : seedRectSegments(partWidth, partHeight, edge)

  return (
    <div className="fixed inset-0 z-[70] bg-black/85">
      <ShapeEditor
        partWidth={partWidth}
        partHeight={partHeight}
        partLabel={partLabel}
        initialSegments={seeded}
        onSave={onSave}
        onCancel={onCancel}
      />
    </div>
  )
}
