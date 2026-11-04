'use client'

// Rangehood section of the cabinet panel (z_rangehood R5) — shows on a cabinet
// with the `rangehood` block (WRH): the hole through the bottom (and the under
// panel), the flue notch the box stands around, and the first fixed shelf's
// height. Writes `rangehood`; the resolver builds the rest.

import { CabinetInstance } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'
import { normaliseRangehood, type RangehoodSettings } from '@/src/lib/rangehood'

export default function RangehoodSection({ cabinet, onUpdate, inp, lbl }: {
  cabinet: CabinetInstance
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  inp: string
  lbl: string
}) {
  const s = normaliseRangehood(cabinet.rangehood)
  if (!s) return null
  const put = (next: Partial<RangehoodSettings>) => void onUpdate(cabinet.id, { rangehood: { ...s, ...next } })
  const row = (label: string, title: string, value: number, commit: (v: number) => void) => (
    <div className="grid grid-cols-[1fr_4.5rem] gap-1 items-center" title={title}>
      <label className="text-xs text-gray-300">{label}</label>
      <CalcInput value={value} decimals={1} onCommit={commit} className={inp + ' text-right'} />
    </div>
  )
  const hole = (k: keyof RangehoodSettings['hole'], v: number | null) => put({ hole: { ...s.hole, [k]: v } })
  const flue = (k: keyof RangehoodSettings['flue'], v: number) => put({ flue: { ...s.flue, [k]: v } })
  const unset = s.hole.w == null || s.hole.d == null

  return (
    <div className="space-y-2 border-t border-gray-800 pt-3">
      <p className={lbl}>Rangehood</p>

      <p className={lbl}>Hole (bottom + under panel)</p>
      {row('Width', 'Across the cabinet — the rangehood’s cut-out size. 0 = not set yet', s.hole.w ?? 0, v => hole('w', v > 0 ? v : null))}
      {row('Depth', 'Front to back — the rangehood’s cut-out size. 0 = not set yet', s.hole.d ?? 0, v => hole('d', v > 0 ? v : null))}
      {unset && <p className="text-[10px] text-amber-400">⚠ Hole size not set — no hole is cut until it is.</p>}
      {row('Back from front', 'From the bottom’s front edge (the gables’ with Bottom Type none — then the hole is only in the under panel) to the front of the hole', s.hole.setback, v => { if (v >= 0) hole('setback', v) })}
      {row('Off centre', '+ moves the hole right, − left', s.hole.offset, v => hole('offset', v))}
      {row('Corner radius', '0 = square corners', s.hole.radius, v => { if (v >= 0) hole('radius', v) })}

      <p className={lbl}>Flue (shelf + top notch)</p>
      {row('Width', 'Notch width between the flue box sides', s.flue.w, v => { if (v > 0) flue('w', v) })}
      {row('Depth', 'Notch depth from the shelf’s back edge — the box sides run this deep', s.flue.d, v => { if (v > 0) flue('d', v) })}
      {row('Off centre', '+ moves the flue right, − left', s.flue.offset, v => flue('offset', v))}

      {row('Shelf height', 'Cabinet underside (incl. under panel) to the underside of the first fixed shelf', s.shelf_h, v => { if (v > 0) put({ shelf_h: v }) })}
      <p className="text-[10px] text-gray-600">
        The flue box (2 sides + a front piece, carcass board) stands on the shelf up to the top,
        screwed through both with 5mm Dynamic Holes. The front piece and the sides&rsquo; front edges are taped.
      </p>
    </div>
  )
}
