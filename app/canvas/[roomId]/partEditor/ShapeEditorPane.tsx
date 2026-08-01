'use client'

// ============================================================
// Shape Editor pane — mounts the 2D profile editor INSIDE the
// Part Editor's centre pane (M7: native embed; replaces the old
// full-screen ShapeEditorOverlay). hideChrome drops the editor's
// branding + Save/Exit — the Part Editor header owns those via
// the forwarded imperative handle (requestSave/requestExit run
// the same closed-shape gate + heal dialog as the buttons did).
//
// FRAME: the editor works in the part's UPRIGHT DISPLAY frame —
// partWidth = sw (across), partHeight = sh (up) — the same frame
// as the 3D box and PartEdge top/bottom/left/right semantics, so
// the bounding box maps 1:1 onto size overrides and banding seeds
// straight from displayEdge. ShapeEditor's y grows DOWNWARD from
// the visual top-left; segments are persisted EXACTLY as emitted
// (mm, y-down, CCW). referenceOutlines are ghosts of neighbouring
// parts in this same frame (partEditor/referenceOutlines.ts).
// ============================================================

import { forwardRef } from 'react'
import ShapeEditor, { type ShapeEditorHandle } from '@/src/components/ShapeEditor/ShapeEditor'
import type { PartEdge } from '@/src/components/three/PartViewer'
import type { ShapeMeta, ShapeSegment } from '../canvasDB'
import type { RefOutline } from './referenceOutlines'

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

const ShapeEditorPane = forwardRef<ShapeEditorHandle, {
  partLabel:  string
  partWidth:  number   // sw — upright display frame, across (mm)
  partHeight: number   // sh — upright display frame, up (mm)
  edge?:      PartEdge // displayEdge (mirror-adjusted) — seeds banding tape on a fresh rectangle
  initialSegments?: ShapeSegment[] | null
  referenceOutlines?: RefOutline[] | null
  onSave:   (segments: ShapeSegment[], meta: ShapeMeta) => void
  onCancel: () => void
}>(function ShapeEditorPane({ partLabel, partWidth, partHeight, edge, initialSegments, referenceOutlines, onSave, onCancel }, ref) {
  const seeded = initialSegments && initialSegments.length > 0
    ? initialSegments
    : seedRectSegments(partWidth, partHeight, edge)

  return (
    <div className="w-full h-full min-h-0">
      <ShapeEditor
        ref={ref}
        hideChrome
        partWidth={partWidth}
        partHeight={partHeight}
        partLabel={partLabel}
        initialSegments={seeded}
        referenceOutlines={referenceOutlines ?? undefined}
        onSave={onSave}
        onCancel={onCancel}
      />
    </div>
  )
})

export default ShapeEditorPane
