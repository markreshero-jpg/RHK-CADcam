'use client'

// Rangehood section of the cabinet panel (z_rangehood R5) — shows on a cabinet
// with the `rangehood` block (WRH): the hole through the bottom (and the under
// panel), the flue notch the box stands around, and the first fixed shelf's
// height. Writes `rangehood`; the resolver builds the rest.

import { CabinetInstance } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'
import { normaliseRangehood, DEFAULT_RANGEHOOD_COVER, type RangehoodSettings } from '@/src/lib/rangehood'

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
  const so = s.mount === 'slideout'
  const unset = so ? s.hole.d == null : s.hole.w == null || s.hole.d == null
  // z_curved_end C9: on a curved end the formers stand in for the bottom / shelf / top.
  const crv = !!cabinet.curved_end

  return (
    <div className="space-y-2 border-t border-gray-800 pt-3">
      <p className={lbl}>Rangehood</p>

      {!crv && (
        <div className="grid grid-cols-[1fr_7rem] gap-1 items-center" title="Undermount: the hood hangs under a hole in the bottom. Slide-out: the hood body sits in the bottom of the cabinet between the gables (Bottom Type none), the under panel is notched from the front, the doors stop above the visor">
          <label className="text-xs text-gray-300">Type</label>
          <select value={s.mount} onChange={e => put({ mount: e.target.value === 'slideout' ? 'slideout' : 'undermount' })} className={inp}>
            <option value="undermount">Undermount</option>
            <option value="slideout">Slide-out</option>
          </select>
        </div>
      )}

      {so ? <>
        <p className={lbl}>Hood body (under panel notch)</p>
        {row('Width', 'Across the cabinet. 0 = the full width between the gables (the hood screws to them)', s.hole.w ?? 0, v => hole('w', v > 0 ? v : null))}
        {row('Depth', 'Body depth from the front — the under panel is notched this deep from its front edge. 0 = not set yet', s.hole.d ?? 0, v => hole('d', v > 0 ? v : null))}
        {unset && <p className="text-[10px] text-amber-400">⚠ Body depth not set — no under panel notch until it is.</p>}
        {(cabinet.bottom_type ?? 'full') !== 'none' && <p className="text-[10px] text-amber-400">⚠ A slide-out hood fills the bottom — set Bottom Type to none.</p>}
        {row('Back from front', 'From the gables’ front edges to the front of the hood body', s.hole.setback, v => { if (v >= 0) hole('setback', v) })}
      </> : <>
      <p className={lbl}>Hole (bottom + under panel)</p>
      {row('Width', 'Across the cabinet — the rangehood’s cut-out size. 0 = not set yet', s.hole.w ?? 0, v => hole('w', v > 0 ? v : null))}
      {row('Depth', 'Front to back — the rangehood’s cut-out size. 0 = not set yet', s.hole.d ?? 0, v => hole('d', v > 0 ? v : null))}
      {unset && <p className="text-[10px] text-amber-400">⚠ Hole size not set — no hole is cut until it is.</p>}
      {row('Back from front', crv ? 'From the inside face of the face board to the front of the hole' : 'From the bottom’s front edge (the gables’ with Bottom Type none — then the hole is only in the under panel) to the front of the hole', s.hole.setback, v => { if (v >= 0) hole('setback', v) })}
      </>}
      {row('Off centre', '+ moves the hole right, − left', s.hole.offset, v => hole('offset', v))}
      {row('Corner radius', '0 = square corners', s.hole.radius, v => { if (v >= 0) hole('radius', v) })}

      <p className={lbl}>Flue (shelf + top notch)</p>
      {row('Width', 'Notch width between the flue box sides', s.flue.w, v => { if (v > 0) flue('w', v) })}
      {row('Depth', 'Notch depth from the shelf’s back edge — the box sides run this deep', s.flue.d, v => { if (v > 0) flue('d', v) })}
      {row('Off centre', '+ moves the flue right, − left', s.flue.offset, v => flue('offset', v))}

      {row('Shelf height', crv ? 'Cabinet underside to the underside of the rib the flue goes through (support ribs under it are split round the hole)' : 'Cabinet underside (incl. under panel) to the underside of the first fixed shelf', s.shelf_h, v => { if (v > 0) put({ shelf_h: v }) })}
      {!so && row('Bottom skin', 'Onion skin left in the hole through the bottom (e.g. 0.5) — holds the cut-out in so a thin strip beside it doesn’t snap; broken out after the sheet is cut. 0 = cut through', s.bottom_skin, v => { if (v >= 0) put({ bottom_skin: v }) })}
      {!so && row('Under panel skin', 'Onion skin left in the under panel’s hole (e.g. 0.3) — broken out after the sheet is cut. 0 = cut through', s.panel_skin, v => { if (v >= 0) put({ panel_skin: v }) })}

      {!crv && !so && <>
        <p className={lbl}>Hood cover (behind the doors)</p>
        <label className="flex items-center gap-2 text-xs text-gray-300" title="Carcass-board panel between the gables, flush with their front edges, from the bottom of the inside up to the shelf — hides the hood body">
          <input type="checkbox" checked={!!s.cover} onChange={e => put({ cover: e.target.checked ? { ...DEFAULT_RANGEHOOD_COVER } : null })} />
          Cover panel up to the shelf
        </label>
        {s.cover && <>
          {row('Hinge notch in', 'D notch at each hinge on it, in from the gable', s.cover.notch_w, v => { if (v > 0) put({ cover: { ...s.cover!, notch_w: v } }) })}
          {row('Hinge notch tall', 'Notch height, centred on the hinge plate — it follows the hinges', s.cover.notch_h, v => { if (v > 0) put({ cover: { ...s.cover!, notch_h: v } }) })}
          {row('Notch radius', 'Inside corner radius of the D notch', s.cover.notch_r, v => { if (v >= 0) put({ cover: { ...s.cover!, notch_r: v } }) })}
          <p className="text-[10px] text-gray-600">Keep the hinges clear of the cover&rsquo;s top and bottom edges (half the notch height) — set them on the doors.</p>
        </>}
      </>}

      <p className="text-[10px] text-gray-600">
        The flue box (2 sides + a front piece, carcass board) stands on the shelf up to the top,
        screwed through both with 5mm Dynamic Holes. The front piece and the sides&rsquo; front edges are taped.
        {crv && ' Ribs above the shelf are notched round the box. The hole and flue centre on the inside between the fixing panel and the face board.'}
      </p>
    </div>
  )
}
