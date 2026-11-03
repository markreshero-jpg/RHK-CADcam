'use client'

import { useEffect, useMemo, useState } from 'react'
import CalcInput from '@/src/components/CalcInput'
import { kickRunSegments, roundSubSeams, splitKickSegments } from '@/src/lib/resolver/resolveKickRun'
import { dbLoadKickRunSettings, dbUpdateKickRunSettings, type KickRunMutation, type KickRunSettings } from './canvasDB'

type Mode = KickRunSettings['split_mode']

const fmt = (n: number) => String(Math.round(n * 10) / 10)
const fmtList = (xs: number[] | null) => (xs ?? []).map(fmt).join(', ')
const parseList = (t: string): number[] =>
  t.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0)

// Default face seam: the cabinet joint nearest the middle whose pieces all fit
// the max length (a seam on a joint lines up with the door / panel lines above);
// else the even split.
function suggestFaceSeams(L: number, joints: number[], maxSeg: number): number[] {
  const fits = (xs: number[]) => {
    const cuts = [0, ...xs, L]
    return cuts.slice(1).every((x, i) => x - cuts[i] <= maxSeg + 0.5)
  }
  if (L <= maxSeg) return []
  const one = joints.filter(j => fits([j])).sort((a, b) => Math.abs(a - L / 2) - Math.abs(b - L / 2))
  if (one.length) return [one[0]]
  return splitKickSegments(L, maxSeg, 'equal').slice(1).map(s => s.start)
}

// Set how a joined kick splits into manufacturable lengths (z_kick_join).
//  • Even / Full + remainder: face, sub front and back cut at the same seams.
//  • Set seams (KS1): face seams and sub front seams set separately; the back is
//    the sub front mirrored end for end so the long pieces start at opposite ends.
// Seams are mm from the kick's left end. A spreader goes on every seam; split
// pieces get "JOIN" on their names. No length warning here: a piece longer than
// the sheet shows in the optimiser as too large for any sheet.
export default function KickRunSettingsModal({ runId, runLength, joints, onClose, onSaved }: {
  runId:     string
  runLength: number        // kick length (face start to face end)
  joints:    number[]      // cabinet joints along the kick, mm from its left end
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

  useEffect(() => {
    let live = true
    dbLoadKickRunSettings(runId).then(s => {
      if (!live) return
      setMaxSeg(s.max_segment_length)
      setMode(s.split_mode)
      setFaceText(fmtList(s.face_splits))
      setSubText(fmtList(s.sub_splits))
      setLoading(false)
    })
    return () => { live = false }
  }, [runId])

  const max = maxSeg && maxSeg > 0 ? maxSeg : 2400
  const faceSeams = parseList(faceText)
  const subSeams  = parseList(subText)

  // Switching to Set seams with nothing entered fills the suggestions.
  function pickMode(m: Mode) {
    setMode(m)
    if (m === 'manual') {
      if (!faceText.trim()) setFaceText(fmtList(suggestFaceSeams(L, joints, max)))
      if (!subText.trim())  setSubText(fmtList(roundSubSeams(L, max)))
    }
  }

  const settings: KickRunSettings = {
    max_segment_length: maxSeg,
    split_mode: mode,
    face_splits: mode === 'manual' ? faceSeams : null,
    sub_splits:  mode === 'manual' ? subSeams : null,
  }
  const segs = useMemo(() => kickRunSegments(L, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [L, maxSeg, mode, faceText, subText])
  const lens = (xs: { len: number }[]) => xs.map(s => fmt(s.len)).join(' / ')

  async function save() {
    setSaving(true)
    const mut = await dbUpdateKickRunSettings(runId, settings)
    onSaved(mut)
    onClose()
  }

  const inputCls = 'w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white focus:border-blue-500 outline-none'
  const chip = 'px-2 py-0.5 rounded bg-gray-700 text-[11px] text-gray-200 hover:bg-gray-600'
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
                      <button key={j} className={chip} onClick={() => setFaceText(fmt(j))} title="Split the face on this cabinet joint">
                        joint {fmt(j)}
                      </button>
                    ))}
                    <button className={chip} onClick={() => setFaceText('')}>none</button>
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-300">Sub front split at (mm from left)</span>
                  <input value={subText} onChange={e => setSubText(e.target.value)} placeholder="no split" className={inputCls} />
                  <div className="flex flex-wrap gap-1">
                    <button className={chip} onClick={() => setSubText(fmtList(roundSubSeams(L, max)))}>round {Math.floor(max / 100) * 100}</button>
                    <button className={chip} onClick={() => setSubText('')}>none</button>
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
