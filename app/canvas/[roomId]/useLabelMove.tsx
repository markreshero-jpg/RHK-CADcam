'use client'
// Moving a cabinet / fixture label on the canvas (plan + elevation): right-click
// → Move label puts that label in move mode — outlined, it follows the mouse,
// a click places it; Esc or right-click cancels (Mark, 2026-10-21). While the
// mode is on, window capture listeners swallow the clicks so the canvas
// underneath never sees them (no select, no deselect, no cabinet move).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { LabelOff } from '@/src/lib/labelOffsets'

interface Target { from: LabelOff; toOff: (dx: number, dy: number) => LabelOff }

export function useLabelMove(
  movingId: string | null | undefined,
  onCommit: ((id: string, off: LabelOff) => void) | undefined,
  onEnd: (() => void) | undefined,
) {
  const [live, setLive] = useState<{ id: string; off: LabelOff } | null>(null)
  const target = useRef<Target | null>(null)
  const commitRef = useRef(onCommit), endRef = useRef(onEnd)
  useEffect(() => { commitRef.current = onCommit; endRef.current = onEnd })

  useEffect(() => {
    if (!movingId) return
    let anchor: { x: number; y: number; base: LabelOff } | null = null
    let cur: LabelOff | null = null
    let placed = false, timer = 0
    const end = () => { window.clearTimeout(timer); setLive(null); endRef.current?.() }
    const block = (e: Event) => { e.stopPropagation(); e.preventDefault() }
    const move = (e: PointerEvent) => {
      const t = target.current
      if (!t || placed) return
      // Relative to where the mouse first moves: the label never jumps.
      if (!anchor) anchor = { x: e.clientX, y: e.clientY, base: t.from }
      const v = t.toOff(e.clientX - anchor.x, e.clientY - anchor.y)
      cur = { x: anchor.base.x + v.x, y: anchor.base.y + v.y }
      setLive({ id: movingId, off: cur })
    }
    const down = (e: PointerEvent) => {
      block(e)
      if (placed) return
      placed = true
      if (e.button === 0 && cur) commitRef.current?.(movingId, cur)
      // Leave once the click / context menu that follows is swallowed too.
      timer = window.setTimeout(end, 500)
    }
    const after = (e: Event) => { block(e); if (placed && (e.type === 'click' || e.type === 'contextmenu')) end() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { block(e); end() } }
    const style = document.createElement('style')
    style.textContent = '* { cursor: move !important }'
    document.head.appendChild(style)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerdown', down, true)
    for (const t of ['pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu']) window.addEventListener(t, after, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.clearTimeout(timer)
      style.remove()
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerdown', down, true)
      for (const t of ['pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu']) window.removeEventListener(t, after, true)
      window.removeEventListener('keydown', key, true)
      setLive(null)
    }
  }, [movingId])

  /**
   * For the label being moved: `from` = its current offset, `toOff` turns a
   * screen-pixel move (dx, dy) into an offset change. Pass the result to
   * <LabelBox track>; undefined for every other label.
   */
  const track = (id: string, from: LabelOff, toOff: (dx: number, dy: number) => LabelOff) =>
    id === movingId ? () => { target.current = { from, toOff } } : undefined

  /** The offset to draw: the live one while this label is moving, else the stored one. */
  const offOf = (id: string, stored: LabelOff | undefined) => (live?.id === id ? live.off : stored)
  return { track, offOf }
}

/**
 * Wraps a label's <text>; when `track` is set (the label is moving) it draws a
 * dashed box round it and registers the label with useLabelMove.
 */
export function LabelBox({ track, children }: { track?: () => void; children: ReactNode }) {
  const g = useRef<SVGGElement>(null), r = useRef<SVGRectElement>(null)
  useLayoutEffect(() => {
    track?.()
    if (!track || !g.current || !r.current) return
    const b = g.current.getBBox(), pad = b.height * 0.25
    const set = (k: string, v: number) => r.current!.setAttribute(k, String(v))
    set('x', b.x - pad); set('y', b.y - pad); set('width', b.width + pad * 2); set('height', b.height + pad * 2)
    r.current.setAttribute('stroke-dasharray', `${b.height * 0.3} ${b.height * 0.2}`)
  })
  return (
    <>
      <g ref={g}>{children}</g>
      {track && <rect ref={r} fill="none" stroke="#f59e0b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
    </>
  )
}
