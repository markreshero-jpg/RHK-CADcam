'use client'

// Inline editor for a CAD text / text box (z_CAD_tool A2): a textarea laid over the
// canvas at the note's spot, sized and styled like the drawn text so typing looks
// like the result. Enter = new line; Ctrl+Enter or clicking away = done; Esc = cancel.

import { useEffect, useRef } from 'react'
import type { AnnotFrame, Pt, TextGeom } from '@/src/lib/annotations/geometry'
import { mapPt, mapRot, textWidth } from '@/src/lib/annotations/geometry'
import { resolveStyle } from '@/src/lib/annotations/style'
import type { AnnotEditing } from './useAnnotationTool'

export default function AnnotTextEditor({ editing, frame, paper, zoom, toClient, onChange, onCommit, onCancel }: {
  editing:  AnnotEditing
  frame:    AnnotFrame
  /** svg units per paper mm */
  paper:    number
  zoom:     number
  /** svg (world) point → viewport px */
  toClient: (p: Pt) => Pt
  onChange: (text: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const openedAt = useRef(0)
  // Focus on the next frame too, in case the click that opened us is still settling.
  useEffect(() => {
    const go = () => { const t = ref.current; if (!t || document.activeElement === t) return; t.focus(); t.setSelectionRange(t.value.length, t.value.length) }
    openedAt.current = performance.now()
    go()
    const id = requestAnimationFrame(go)
    return () => cancelAnimationFrame(id)
  }, [])

  const { draft, text } = editing
  const g = draft.geom as TextGeom
  const s = resolveStyle('text', draft.style)
  const px = paper * zoom                       // screen px per paper mm
  const at = toClient(mapPt(frame, g.at))
  const rot = mapRot(frame, g.rot)
  const lines = text.split('\n')
  const longest = Math.max(...lines.map(l => textWidth(l || ' ', s.size, s.bold)))
  const w = (g.width ?? Math.max(longest + s.size, s.size * 6)) * px
  const lh = s.size * s.lineSpacing
  const h = Math.max(s.size * 1.15 + (lines.length - 1) * lh, g.height ?? 0) * px

  return (
    <textarea
      ref={ref}
      value={text}
      onChange={e => onChange(e.target.value)}
      // A blur in the first moments is the opening click settling, not the user leaving.
      onBlur={() => { if (performance.now() - openedAt.current < 250) requestAnimationFrame(() => ref.current?.focus()); else onCommit() }}
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onCommit() }
      }}
      placeholder="Type a note…"
      spellCheck
      wrap={g.width != null ? 'soft' : 'off'}
      className="fixed z-40 resize-none overflow-hidden outline-none placeholder:text-gray-500"
      style={{
        left: at.x, top: at.y, width: w, height: Math.max(h, s.size * 1.3 * px),
        transform: rot ? `rotate(${rot}deg)` : undefined, transformOrigin: '0 0',
        padding: 0, margin: 0, border: 'none',
        boxShadow: '0 0 0 1px #38bdf8, 0 0 0 3px rgba(56,189,248,0.25)',
        background: s.bg === 'solid' ? s.bgColor : s.bg === 'mask' ? '#ffffff' : 'rgba(15,23,42,0.55)',
        color: s.color,
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: s.size * px,
        lineHeight: `${lh * px}px`,
        paddingTop: Math.max(0, (s.size * 0.9 - s.size * 0.8) * px),
        fontWeight: s.bold ? 700 : 400,
        fontStyle: s.italic ? 'italic' : undefined,
        textDecoration: s.underline ? 'underline' : undefined,
        textAlign: s.align,
        whiteSpace: g.width != null ? 'pre-wrap' : 'pre',
      }}
    />
  )
}
