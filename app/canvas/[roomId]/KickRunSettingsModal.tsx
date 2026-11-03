'use client'

import { useEffect, useMemo, useState } from 'react'
import CalcInput from '@/src/components/CalcInput'
import { kickRunSegments, roundSubSeams, splitKickSegments, kickFaceMaxLength } from '@/src/lib/resolver/resolveKickRun'
import { supabase } from '@/src/lib/supabase'
import { dbLoadKickRunSettings, dbUpdateKickRunSettings, type KickRunMutation, type KickRunSettings } from './canvasDB'

type Mode = KickRunSettings['split_mode']

const fmt = (n: number) => String(Math.round(n * 10) / 10)
const fmtList = (xs: number[] | null) => (xs ?? []).map(fmt).join(', ')
const parseList = (t: string): number[] =>
  t.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0)

// Default face seams, on cabinet joints (a seam on a joint lines up with the
// door / panel lines above): one seam → the joint nearest the middle whose pieces
// fit; more → the fewest joints that keep every piece within the max (farthest
// joint that fits, each time). Joints within 100 of an end are skipped. No joint
// set fits → the even split.
function suggestFaceSeams(L: number, joints: number[], maxSeg: number): number[] {
  if (L <= maxSeg + 0.5) return []
  const js = joints.filter(j => j >= 100 && j <= L - 100)
  const fits = (xs: number[]) => {
    const cuts = [0, ...xs, L]
    return cuts.slice(1).every((x, i) => x - cuts[i] <= maxSeg + 0.5)
  }
  const one = js.filter(j => fits([j])).sort((a, b) => Math.abs(a - L / 2) - Math.abs(b - L / 2))
  if (one.length) return [one[0]]
  const xs: number[] = []
  let at = 0
  while (L - at > maxSeg + 0.5) {
    const next = js.filter(j => j > at + 0.5 && j - at <= maxSeg + 0.5).pop()
    if (next == null) return splitKickSegments(L, maxSeg, 'equal').slice(1).map(s => s.start)
    xs.push(next); at = next
  }
  return xs
}

// Set how a joined kick splits into manufacturable lengths (z_kick_join).
//  • Even / Full + remainder: face, sub front and back cut at the same seams.
//  • Set seams (KS1): face seams and sub front seams set separately; the back is
//    the sub front mirrored end for end so the long pieces start at opposite ends.
// Seams are mm from the kick's left end. Only the boards are cut (no extra spreaders); split
// pieces get "JOIN" on their names. No length warning here: a piece longer than
// the sheet shows in the optimiser as too large for any sheet.
export default function KickRunSettingsModal({ runId, runLength, joints, faceMaterialId, faceGrain, onClose, onSaved }: {
  runId:     string
  runLength: number        // kick length (face start to face end)
  joints:    number[]      // cabinet joints along the kick, mm from its left end
  faceMaterialId: string | null              // the kick face board (resolved face part)
  faceGrain:      'vertical' | 'horizontal'  // its Kick Grain (resolved grain_direction)
  onClose:   () => void
  onSaved:   (m: KickRunMutation) => void
}) {
  const L = runLength
  const [maxSeg, setMaxSeg] = useState<number | null>(null)
  const [mode,   setMode]   = useState<Mode>('equal')
  const [faceText, setFaceText] = useState('')
  const [subText,  setSubText]  = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  // Longest face piece the grain allows (vertical grain on a grained board = the
  // sheet width, 1200 for walnut), read from the face board when the box opens.
  const [faceMax, setFaceMax] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    const mat = faceMaterialId
      ? supabase.from('materials').select('has_grain, sheet_dx, sheet_dy').eq('id', faceMaterialId).maybeSingle().then(r => r.data)
      : Promise.resolve(null)
    Promise.all([dbLoadKickRunSettings(runId), mat]).then(([s, m]) => {
      if (!live) return
      setFaceMax(kickFaceMaxLength(m as { has_grain: boolean; sheet_dx: number; sheet_dy: number } | null, faceGrain))
      setMaxSeg(s.max_segment_length)
      setMode(s.split_mode)
      setFaceText(fmtList(s.face_splits))
      setSubText(fmtList(s.sub_splits))
      setLoading(false)
    })
    return () => { live = false }
  }, [runId, faceMaterialId, faceGrain])

  const max = maxSeg && maxSeg > 0 ? maxSeg : 2400
  const faceCap = faceMax ? Math.min(max, faceMax) : max
  const faceSeams = parseList(faceText)
  const subSeams  = parseList(subText)

  // Switching to Set seams with nothing entered fills the suggestions.
  function pickMode(m: Mode) {
    setMode(m)
    if (m === 'manual') {
      if (!faceText.trim()) setFaceText(fmtList(suggestFaceSeams(L, joints, faceCap)))
      if (!subText.trim())  setSubText(fmtList(roundSubSeams(L, max)))
    }
  }

  const settings: KickRunSettings = {
    max_segment_length: maxSeg,
    split_mode: mode,
    face_splits: mode === 'manual' ? faceSeams : null,
    sub_splits:  mode === 'manual' ? subSeams : null,
  }
  const segs = useMemo(() => kickRunSegments(L, settings, faceMax),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [L, maxSeg, mode, faceText, subText, faceMax])
  const lens = (xs: { len: number }[]) => xs.map(s => fmt(s.len)).join(' / ')

  // Close straight away: the seams are written first, then the kick re-resolves
  // (several seconds) and redraws when it lands.
  async function save() {
    setSaving(true)
    const pending = dbUpdateKickRunSettings(runId, settings)
    onClose()
    onSaved(await pending)
  }

  const inputCls = 'w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white focus:border-blue-500 outline-none'
  // A chip lights up while the seams in its field are the ones it sets.
  const chipCls = (on: boolean) => `px-2 py-0.5 rounded text-[11px] transition-colors ${
    on ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 0.05)
  const fitSeams = suggestFaceSeams(L, joints, faceCap)
  const roundSeams = roundSubSeams(L, max)
  const MODES: { m: Mode; label: string; hint: string }[] = [
    { m: 'equal',  label: 'Even',      hint: 'even pieces' },
    { m: 'exact',  label: 'Full',      hint: 'full + remainder' },
    { m: 'manual', label: 'Set seams', hint: 'face / sub split' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onPointerDown={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-96 p-6 flex flex-col gap-4"
        onPointerDown={e => e.stopPropagation()}>
        <div>
          <p className="text-sm font-semibold text-white">Kick split</p>
          <p className="text-xs text-gray-400 mt-1">{fmt(L)}mm kick — split into manufacturable lengths</p>
        </div>

        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-300">Max piece length (mm)</span>
              <CalcInput
                value={maxSeg}
                onCommit={v => setMaxSeg(v > 0 ? v : null)}
                onClear={() => setMaxSeg(null)}
                min={0}
                decimals={1}
                placeholder={mode === 'manual' ? '2400' : 'no split'}
                className={inputCls}
              />
              <span className="text-[11px] text-gray-500">
                {mode === 'manual' ? 'Used for the suggestions (blank = 2400)' : 'Blank / 0 = one continuous piece'}
              </span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              {MODES.map(({ m, label, hint }) => (
                <button key={m} onClick={() => pickMode(m)}
                  className={`px-2 py-2 rounded-lg text-xs transition-colors ${
                    mode === m ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-[10px] opacity-80">{hint}</span>
                </button>
              ))}
            </div>

            {mode === 'manual' && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-300">Face split at (mm from left)</span>
                  <input value={faceText} onChange={e => setFaceText(e.target.value)} placeholder="no split" className={inputCls} />
                  <div className="flex flex-wrap gap-1">
                    {joints.map(j => (
                      <button key={j} className={chipCls(same(faceSeams, [j]))} onClick={() => setFaceText(fmt(j))} title="Split the face on this cabinet joint">
                        joint {fmt(j)}
                      </button>
                    ))}
                    {faceCap < L && (
                      <button className={chipCls(same(faceSeams, fitSeams))} onClick={() => setFaceText(fmtList(fitSeams))}
                        title="Fewest cabinet joints that keep every face piece within the max">
                        fit {faceCap}
                      </button>
                    )}
                    <button className={chipCls(faceSeams.length === 0)} onClick={() => setFaceText('')}>none</button>
                  </div>
                  {faceMax && (
                    <span className="text-[11px] text-gray-500">Vertical grain: face pieces up to {faceMax} (the sheet width)</span>
                  )}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-300">Sub front split at (mm from left)</span>
                  <input value={subText} onChange={e => setSubText(e.target.value)} placeholder="no split" className={inputCls} />
                  <div className="flex flex-wrap gap-1">
                    <button className={chipCls(subSeams.length > 0 && same(subSeams, roundSeams))} onClick={() => setSubText(fmtList(roundSeams))}>round {Math.floor(max / 100) * 100}</button>
                    <button className={chipCls(subSeams.length === 0)} onClick={() => setSubText('')}>none</button>
                  </div>
                  <span className="text-[11px] text-gray-500">Back = sub front mirrored, long piece from the other end</span>
                </label>
              </>
            )}

            <div className="text-xs text-gray-400 flex flex-col gap-0.5">
              {[
                ['Face', segs.face], ['Sub front', segs.sub], ['Back', segs.back],
              ].map(([name, xs]) => {
                const list = xs as { len: number }[]
                return (
                  <span key={name as string}>
                    {name as string}: {list.length === 1 ? `1 piece ${fmt(list[0].len)}` : `${lens(list)}  JOIN`}
                  </span>
                )
              })}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={() => void save()} disabled={loading || saving}
            className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
