'use client'

// Curved end section of the cabinet panel (z_curved_end C2): hand (Right /
// Left / Both), radius, skin, overhangs, scribes, fixing blocks, rib
// cut-outs and face board grain. Writes `curved_end`, plus `footprint` when
// the hand or radius changes (the plan outline is built from them).

import { CabinetInstance } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'
import { getCachedInput } from '@/src/lib/resolver/resolveCabinetFromDB'
import {
  normaliseCurvedEnd, curvedEndFootprint, curvedEndParams, curvedEndCode, HAND_OPTIONS,
  type CurvedEndSettings,
} from '@/src/lib/curvedEnd/settings'
import { calcCurvedEnd, SKIN_MIN, SKIN_MAX, f1 } from '@/src/lib/curvedEnd/geometry'

const BASE_CODE: Record<string, string> = { base: 'BCRVFIXP', wall: 'WCRVFIXP', tall: 'TCRVFIXP' }

export default function CurvedEndSection({ cabinet, onUpdate, inp, lbl }: {
  cabinet: CabinetInstance
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  inp: string
  lbl: string
}) {
  const s = normaliseCurvedEnd(cabinet.curved_end)
  if (!s) return null
  const put = (next: Partial<CurvedEndSettings>) => {
    const merged = { ...s, ...next }
    const reshape = next.hand !== undefined || next.R !== undefined
    void onUpdate(cabinet.id, {
      curved_end: merged,
      ...(reshape ? { footprint: curvedEndFootprint(merged, { w: cabinet.dx, d: cabinet.dz }) } : {}),
    })
  }
  // Live check with the real board thicknesses (shop materials) once resolved.
  const cached = getCachedInput(cabinet.id)
  const FT = cached?.exposed_material.DZ ?? 18, T = cached?.material.DZ ?? 16.5
  const c = calcCurvedEnd(curvedEndParams(s, { DX: cabinet.dx, DY: cabinet.dy, DZ: cabinet.dz }, FT, T))
  const single = s.hand !== 'DOUBLE'
  // A single end only overhangs at its wall end: right for RH, left for LH.
  const backKey: 'OL' | 'OR' = s.hand === 'LH' ? 'OL' : 'OR'
  const code = curvedEndCode(BASE_CODE[cabinet.assembly_class.replace(/_corner$/, '')] ?? 'CRVFIXP', s.hand)

  const row = (label: string, value: number, onCommit: (v: number) => void, title?: string) => (
    <div className="grid grid-cols-[1fr_4.5rem] gap-1 items-center" title={title}>
      <label className="text-xs text-gray-300">{label}</label>
      <CalcInput value={value} decimals={1} onCommit={onCommit} className={inp + ' text-right'} />
    </div>
  )
  const tick = (label: string, checked: boolean, onChange: (v: boolean) => void, title?: string) => (
    <label className="flex items-center gap-2 text-xs text-gray-300" title={title}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )

  return (
    <div className="space-y-2 border-t border-gray-800 pt-3">
      <p className={lbl}>Curved end · {code}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className={lbl}>Curve</label>
          <select value={s.hand} onChange={e => put({ hand: e.target.value as CurvedEndSettings['hand'] })} className={inp}>
            {HAND_OPTIONS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Face grain</label>
          <select value={s.grain} onChange={e => put({ grain: e.target.value as CurvedEndSettings['grain'] })} className={inp}>
            <option value="vertical">Vertical</option>
            <option value="horizontal">Along the wrap</option>
          </select>
        </div>
      </div>
      {row('Radius', s.R, v => { if (v > 0) put({ R: v }) }, 'Outside radius of the curve')}
      {row('Skin', s.SK, v => { if (v > 0) put({ SK: v }) },
        `Face board left in the bend pocket (pocket depth = board − skin). ${SKIN_MIN}–${SKIN_MAX} mm bends best.`)}

      <div className="grid grid-cols-[1fr_3.5rem_4.5rem] gap-1 items-center"
        title={`Formers between the top and bottom. Auto adds them until the clear gap is under ${c.maxGap}.`}>
        <label className="text-xs text-gray-300">Ribs</label>
        <label className="flex items-center gap-1 text-[10px] text-gray-400">
          <input type="checkbox" checked={s.ribs == null}
            onChange={e => put({ ribs: e.target.checked ? null : c.gaps - 1 })} />
          Auto
        </label>
        <CalcInput value={c.gaps - 1} decimals={0} disabled={s.ribs == null}
          onCommit={v => { if (v >= 0) put({ ribs: Math.round(v) }) }}
          className={inp + ' text-right disabled:opacity-40'} />
      </div>

      <p className={lbl}>Overhangs (trimmed after glue-up)</p>
      {single && row('Gable end', s.OG, v => put({ OG: Math.max(0, v) }), 'Face board runs past the fixing panel at its front end')}
      {single
        ? row('Wall end', s[backKey], v => put({ [backKey]: Math.max(0, v) }), 'Face board runs past the wall line')
        : <>
            {row('Left wall end', s.OL, v => put({ OL: Math.max(0, v) }))}
            {row('Right wall end', s.OR, v => put({ OR: Math.max(0, v) }))}
          </>}

      <p className={lbl}>Scribes (face board stays full size)</p>
      {row('Back', s.SBK, v => put({ SBK: Math.max(0, v) }), 'Carcass stops this far short of the wall')}
      {row('Bottom', s.SBT, v => put({ SBT: Math.max(0, v) }), 'Carcass sits this far up off the floor')}
      {row('Top', s.STP, v => put({ STP: Math.max(0, v) }), 'Carcass stops this far below the top of the face board')}

      <p className={lbl}>Fixing blocks</p>
      {tick('Side block', s.blkS, v => put({ blkS: v }), 'Strip behind the face board’s flat side, notched into the formers')}
      {tick('Front block', s.blkF, v => put({ blkF: v }), 'Strip behind the face board’s flat front, notched into the formers')}

      {tick('Rib cut-outs', s.lighten, v => put({ lighten: v }), 'Cut the centre out of each rib (not the top or bottom)')}
      {s.lighten && (
        <>
          {row('Border', s.B, v => { if (v > 0) put({ B: v }) })}
          {tick('Onion skin', s.onion, v => put({ onion: v }))}
          {s.onion && row('Onion skin', s.OS, v => put({ OS: Math.max(0, v) }))}
          <p className="text-[10px] text-gray-600">Shown in the parts once the cut-out route is built (C4).</p>
        </>
      )}

      <p className="text-[10px] text-gray-500">
        Face board {f1(c.wrapLen)} × {f1(cabinet.dy)} · {f1(FT)} · pocket {f1(FT - s.SK)} deep
        {single && !s.OG ? ' · gable end edged' : ''} · {c.gaps - 1} rib{c.gaps - 1 === 1 ? '' : 's'} at {f1(c.pitch)} c/c, {f1(c.clear)} clear
      </p>
      {[...c.warnings, ...c.notes].map(m => (
        <p key={m} className={`text-[10px] ${c.warnings.includes(m) ? 'text-red-400' : 'text-amber-400'}`}>{m}</p>
      ))}
    </div>
  )
}
