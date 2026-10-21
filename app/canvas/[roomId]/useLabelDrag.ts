'use client'
// Dragging a cabinet / fixture label on the canvas (plan + elevation). The
// label captures the pointer, so the drag never reaches the item or the canvas
// underneath (no cabinet move, no deselect). Live offset while dragging; the
// owner commits on release.
import { useRef, useState, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent } from 'react'
import type { LabelOff } from '@/src/lib/labelOffsets'

interface Drag { id: string; from: LabelOff; sx: number; sy: number; toOff: (dx: number, dy: number) => LabelOff; cur: LabelOff | null }

export function useLabelDrag(onCommit: ((id: string, off: LabelOff) => void) | undefined) {
  const [live, setLive] = useState<{ id: string; off: LabelOff } | null>(null)
  const drag = useRef<Drag | null>(null)

  /**
   * Pointer props for a label. `from` = the label's current offset; `toOff`
   * turns a screen-pixel drag (dx, dy) into an offset change.
   */
  const bind = (id: string, from: LabelOff, toOff: (dx: number, dy: number) => LabelOff) => ({
    onPointerDown: (e: RPointerEvent<SVGElement>) => {
      if (e.button !== 0 || !onCommit) return
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { id, from, sx: e.clientX, sy: e.clientY, toOff, cur: null }
    },
    onPointerMove: (e: RPointerEvent<SVGElement>) => {
      const d = drag.current
      if (!d || d.id !== id) return
      e.stopPropagation()
      const v = d.toOff(e.clientX - d.sx, e.clientY - d.sy)
      d.cur = { x: d.from.x + v.x, y: d.from.y + v.y }
      setLive({ id, off: d.cur })
    },
    onPointerUp: (e: RPointerEvent<SVGElement>) => {
      const d = drag.current
      if (!d || d.id !== id) return
      e.stopPropagation()
      drag.current = null
      setLive(null)
      if (d.cur) onCommit?.(id, d.cur)
    },
    onClick: (e: RMouseEvent) => e.stopPropagation(),
    style: { cursor: 'move', userSelect: 'none' as const, pointerEvents: 'all' as const },
  })

  /** The offset to draw: the live one while this label is being dragged, else the stored one. */
  const offOf = (id: string, stored: LabelOff | undefined) => (live?.id === id ? live.off : stored)
  return { bind, offOf, dragging: live?.id ?? null }
}

/** Pointer props for a draggable label (useLabelDrag().bind). */
export type LabelDragProps = ReturnType<ReturnType<typeof useLabelDrag>['bind']>
