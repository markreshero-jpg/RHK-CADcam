'use client'

// ============================================================
// Benchtop quick-draw sizes (F4 rect / polygon / L / U).
// Same pattern as the wall DrawingPanel: fields follow the
// mouse until you type in them; Tab moves between fields and
// previews; Enter places the point (the final point commits the
// benchtop). Rectangle = Width / Depth; the others = Length /
// Angle of the side being drawn, plus Depth for L / U.
// Line + offset (Phase 7c) = Length / Angle of the back line, then
// the Depth pulled off it.
// ============================================================

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { evalCalc } from '@/src/lib/calc'
import type { Pt } from '@/src/lib/geometry'
import type { Mode } from './canvasTypes'
import { offsetFromLine } from '@/src/lib/benchtopJoinTops'

type Vals = { len?: number; ang?: number; w?: number; d?: number }
type FieldKey = 'w' | 'd' | 'len' | 'ang' | 'depth'

export interface BenchtopDrawPanelHandle { focusFirst: () => void }

const TITLES: Partial<Record<Mode, string>> = {
  draw_benchtop_rect: 'Rectangle', draw_benchtop: 'Polygon', draw_benchtop_l: 'L-shape', draw_benchtop_u: 'U-shape',
  draw_benchtop_line: 'Line + offset',
}
const STEP_NAMES: Partial<Record<Mode, string[]>> = {
  draw_benchtop_l: ['First leg', 'Second leg'],
  draw_benchtop_u: ['Arm 1', 'Back', 'Arm 2'],
  draw_benchtop_line: ['Back line', 'Depth'],
}

const BenchtopDrawPanel = forwardRef<BenchtopDrawPanelHandle, {
  mode: Mode
  anchor: Pt | null
  cursor: Pt | null
  pointCount: number
  /** Line tool: the back line, once both ends are placed. */
  lineBase?: [Pt, Pt] | null
  depth: number
  setDepth: (d: number) => void
  onPreview: (v: Vals) => void
  onPlace: (v: Vals) => void
  onClosePolygon: () => void
  onCancel: () => void
}>(function BenchtopDrawPanel({ mode, anchor, cursor, pointCount, lineBase, depth, setDepth, onPreview, onPlace, onClosePolygon, onCancel }, ref) {
  const isRect = mode === 'draw_benchtop_rect'
  const hasDepth = mode === 'draw_benchtop_l' || mode === 'draw_benchtop_u'
  const lineDepth = mode === 'draw_benchtop_line' && !!lineBase
  const fields: FieldKey[] = !anchor
    ? (hasDepth ? ['depth'] : [])
    : isRect ? ['w', 'd'] : lineDepth ? ['d'] : hasDepth ? ['len', 'ang', 'depth'] : ['len', 'ang']

  const live: Record<FieldKey, number> = {
    w: anchor && cursor ? Math.round(Math.abs(cursor.x - anchor.x)) : 0,
    d: lineDepth && cursor ? Math.round(Math.abs(offsetFromLine(lineBase![0], lineBase![1], cursor)))
      : anchor && cursor ? Math.round(Math.abs(cursor.y - anchor.y)) : 0,
    len: anchor && cursor ? Math.round(Math.hypot(cursor.x - anchor.x, cursor.y - anchor.y)) : 0,
    ang: anchor && cursor ? Math.round(Math.atan2(cursor.y - anchor.y, cursor.x - anchor.x) * 1800 / Math.PI) / 10 : 0,
    depth,
  }

  const [vals, setVals] = useState<Record<FieldKey, string>>(() => ({
    w: String(live.w), d: String(live.d), len: String(live.len), ang: String(live.ang), depth: String(depth),
  }))
  // A typed field stops following the mouse until the next point is placed.
  const dirty = useRef<Set<FieldKey>>(new Set())
  const focused = useRef<FieldKey | null>(null)
  const refs = useRef<Partial<Record<FieldKey, HTMLInputElement | null>>>({})

  useImperativeHandle(ref, () => ({
    focusFirst: () => { const k = fields[0]; if (k) { refs.current[k]?.focus(); refs.current[k]?.select() } },
  }))

  // Follow the mouse (untyped, unfocused fields only).
  const liveKey = `${live.w}|${live.d}|${live.len}|${live.ang}|${depth}`
  useEffect(() => {
    setVals(v => {
      const n = { ...v }
      for (const k of ['w', 'd', 'len', 'ang', 'depth'] as FieldKey[]) {
        if (!dirty.current.has(k) && focused.current !== k) n[k] = String(live[k])
      }
      return n
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey])

  // New point placed → fresh side: drop typed values, keep the keyboard flow
  // going (re-select the first field if the panel had focus).
  const anchorKey = anchor ? `${anchor.x},${anchor.y}` : ''
  useEffect(() => {
    const hadFocus = focused.current
    dirty.current = new Set([...dirty.current].filter(k => k === 'depth'))
    if (hadFocus && fields[0]) { refs.current[fields[0]]?.focus(); refs.current[fields[0]]?.select() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey])

  const num = (k: FieldKey) => evalCalc(vals[k])
  const current = (): Vals => ({ len: num('len') ?? undefined, ang: num('ang') ?? undefined, w: num('w') ?? undefined, d: num('d') ?? undefined })

  function commitDepth() {
    const d = num('depth')
    if (d != null && d >= 50 && d !== depth) setDepth(d)
  }

  function onKey(e: React.KeyboardEvent, k: FieldKey) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitDepth()
      if (anchor) onPlace(current())
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commitDepth()
      if (anchor) onPreview(current())
      const i = fields.indexOf(k)
      const next = fields[(i + (e.shiftKey ? fields.length - 1 : 1)) % fields.length]
      refs.current[next]?.focus(); refs.current[next]?.select()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      ;(e.target as HTMLInputElement).blur()
      onCancel()
    }
  }

  const LABELS: Record<FieldKey, string> = { w: 'Width (mm)', d: 'Depth (mm)', len: 'Length (mm)', ang: 'Angle (°)', depth: 'Benchtop depth (mm)' }
  const step = STEP_NAMES[mode]?.[pointCount - 1]
  const inputCls = 'w-full bg-gray-800 border border-gray-700 focus:border-teal-500 rounded px-2 py-1.5 text-sm text-white outline-none'

  return (
    <div className="w-52 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Drawing Benchtop</p>
        <p className="text-[10px] text-gray-500">{TITLES[mode]}{step ? ` · ${step}` : ''}</p>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        {!anchor && <p className="text-xs text-gray-500">Click the first point on the plan — then type sizes here.</p>}
        {fields.map(k => (
          <div key={k}>
            <label className="text-xs text-gray-500 block mb-1">{LABELS[k]}</label>
            <input
              ref={el => { refs.current[k] = el }}
              type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
              value={vals[k]}
              onChange={e => { setVals(v => ({ ...v, [k]: e.target.value })); dirty.current.add(k) }}
              onFocus={e => { focused.current = k; e.target.select() }}
              onBlur={() => { focused.current = null; if (k === 'depth') commitDepth() }}
              onKeyDown={e => onKey(e, k)}
              className={inputCls}
            />
          </div>
        ))}
        {anchor && (
          <button onClick={() => { commitDepth(); onPlace(current()) }}
            className="w-full bg-teal-700 hover:bg-teal-600 text-white text-xs font-semibold py-1.5 rounded transition-colors">
            {isRect || lineDepth || (mode === 'draw_benchtop_l' && pointCount >= 2) || (mode === 'draw_benchtop_u' && pointCount >= 3)
              ? 'Place benchtop ↵' : 'Place point ↵'}
          </button>
        )}
        {mode === 'draw_benchtop' && pointCount >= 3 && (
          <button onClick={onClosePolygon}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white text-xs py-1.5 rounded transition-colors">
            Close shape &amp; finish
          </button>
        )}
        <p className="text-xs text-gray-600 leading-relaxed">
          Tab between fields · Enter to place · Esc to cancel{isRect ? ' · direction follows the mouse' : ''}
        </p>
        {mode === 'draw_benchtop_line' && (
          <p className="text-[10px] text-gray-600 leading-relaxed">
            Click both ends of the back line on the wall (any angle), then pull the depth off it — or type it. It goes to the side the mouse is on.
          </p>
        )}
        {hasDepth && (
          <p className="text-[10px] text-gray-600 leading-relaxed">
            Lengths run along the front (inside) edge you click; the depth goes behind it.
          </p>
        )}
      </div>
    </div>
  )
})

export default BenchtopDrawPanel
