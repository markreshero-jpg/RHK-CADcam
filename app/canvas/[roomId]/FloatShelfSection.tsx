'use client'

// Floating shelf section of the cabinet panel (z_floating_shelf FS4): build
// (double / triple build-up / triple solid), seen left / right, the cleat slot
// (rebate depth, height, stop), build-up strips, cleats and the wide tape.
// Writes `float_shelf`; the height follows the built thickness (CanvasClient).

import { useEffect, useState } from 'react'
import { CabinetInstance } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'
import { supabase } from '@/src/lib/supabase'
import { getCachedInput } from '@/src/lib/resolver/resolveCabinetFromDB'
import { normaliseFloatShelf, fsTapeLength, fsLayers, FS_BUILDS, type FloatShelfSettings } from '@/src/lib/floatShelf'

type Tape = { id: string; name: string; width: number | null; thickness: number | null }

export default function FloatShelfSection({ cabinet, onUpdate, inp, lbl }: {
  cabinet: CabinetInstance
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  inp: string
  lbl: string
}) {
  const [tapes, setTapes] = useState<Tape[]>([])
  useEffect(() => {
    supabase.from('edge_banding').select('id,name,width,thickness').eq('active', true).order('width', { ascending: false }).order('name')
      .then(({ data }) => setTapes((data ?? []) as Tape[]))
  }, [])

  const s = normaliseFloatShelf(cabinet.float_shelf)
  if (!s) return null
  const put = (next: Partial<FloatShelfSettings>) => void onUpdate(cabinet.id, { float_shelf: { ...s, ...next } })
  const num = (k: 'rebate_depth' | 'rebate_h' | 'stop' | 'strip_w' | 'strip_spacing', label: string, title: string, min = 0.1) => (
    <div className="grid grid-cols-[1fr_4.5rem] gap-1 items-center" title={title}>
      <label className="text-xs text-gray-300">{label}</label>
      <CalcInput value={s[k]} decimals={1} onCommit={v => { if (v >= min) put({ [k]: v }) }} className={inp + ' text-right'} />
    </div>
  )

  const cached = getCachedInput(cabinet.id)
  const T = cached?.exposed_material.DZ
  const defaultTapeId = cached?.exposed_edgeband_id
  const tapeName = (id: string | null | undefined) => tapes.find(t => t.id === id)?.name
  const triple = fsLayers(s.build) === 3

  return (
    <div className="space-y-2 border-t border-gray-800 pt-3">
      <p className={lbl}>Floating shelf</p>
      <div>
        <label className={lbl}>Build</label>
        <select value={s.build} onChange={e => put({ build: e.target.value as FloatShelfSettings['build'] })} className={inp}>
          {FS_BUILDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        {T != null && (
          <p className="text-[10px] text-gray-500 mt-0.5">{fsLayers(s.build)} × {T} = {Math.round(fsLayers(s.build) * T * 10) / 10} thick (exposed board)</p>
        )}
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input type="checkbox" checked={s.seen_left} onChange={e => put({ seen_left: e.target.checked })} />
          Seen left
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input type="checkbox" checked={s.seen_right} onChange={e => put({ seen_right: e.target.checked })} />
          Seen right
        </label>
      </div>
      <p className="text-[10px] text-gray-600">Front and underside are always seen; the back never is. A seen side is taped and has no slot.</p>

      <p className={lbl}>Cleat slot</p>
      {num('rebate_depth', 'Rebate depth', 'How far the slot runs in from the back (and from an unseen side)')}
      {!triple && num('rebate_h', 'Rebate height (each board)', 'Pocket depth into each board\'s inner face — the slot is twice this')}
      {!triple && num('stop', 'Stop from seen edge', 'The slot stops this far short of the front and of a seen side', 0)}
      {triple && <p className="text-[10px] text-gray-600">Triple: the slot is the middle layer ({T ?? '—'} high).{s.build === 'triple_solid' ? '' : ' It stops at the strips.'}</p>}
      {s.build === 'triple_solid' && num('stop', 'Stop from seen edge', 'The slot stops this far short of the front and of a seen side', 0)}

      {s.build === 'triple_buildup' && <>
        <p className={lbl}>Middle-layer strips</p>
        {num('strip_w', 'Strip width', 'Front / back rails, side strips and cross strips')}
        {num('strip_spacing', 'Cross strips max centres', 'Cross strips are spread evenly, no further apart than this')}
      </>}

      <label className="flex items-center gap-2 text-xs text-gray-300"
        title="Hand-cut timber / MDF strips sized to the slot: on the cut list, never sent to the CNC.">
        <input type="checkbox" checked={s.cleat} onChange={e => put({ cleat: e.target.checked })} />
        Cleats (hand cut)
      </label>

      <div>
        <label className={lbl}>Wide tape (after glue-up)</label>
        <select value={s.tape_id ?? ''} onChange={e => put({ tape_id: e.target.value || null })} className={inp}>
          <option value="">Exposed edgeband{tapeName(defaultTapeId) ? ` — ${tapeName(defaultTapeId)}` : ''}</option>
          {tapes.map(t => <option key={t.id} value={t.id}>{t.name}{t.width ? ` (${t.width})` : ''}</option>)}
        </select>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Tape run: {fsTapeLength(s, cabinet.dx, cabinet.dz)} mm (front{s.seen_left ? ' + left' : ''}{s.seen_right ? ' + right' : ''}).
          Boards are cut untaped, marked &ldquo;build up then edge&rdquo;.
        </p>
      </div>
    </div>
  )
}
