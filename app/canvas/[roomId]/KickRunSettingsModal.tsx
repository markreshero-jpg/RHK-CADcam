'use client'

import { useEffect, useMemo, useState } from 'react'
import CalcInput from '@/src/components/CalcInput'
import { splitKickSegments } from '@/src/lib/resolver/resolveKickRun'
import { dbLoadKickRunSettings, dbUpdateKickRunSettings, type KickRunMutation } from './canvasDB'

// Set how a joined kick splits into manufacturable lengths. The kick is one
// continuous part; if the run is longer than the entered max segment length it's
// cut into pieces (seams placed away from cabinet boundaries, a spreader at each).
export default function KickRunSettingsModal({ runId, runLength, onClose, onSaved }: {
  runId:     string
  runLength: number
  onClose:   () => void
  onSaved:   (m: KickRunMutation) => void
}) {
  const [maxSeg, setMaxSeg] = useState<number | null>(null)
  const [mode,   setMode]   = useState<'equal' | 'exact'>('equal')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    let live = true
    dbLoadKickRunSettings(runId).then(s => {
      if (!live) return
      setMaxSeg(s.max_segment_length)
      setMode(s.split_mode)
      setLoading(false)
    })
    return () => { live = false }
  }, [runId])

  // Live preview of the resulting pieces.
  const segs = useMemo(() => splitKickSegments(runLength, maxSeg, mode), [runLength, maxSeg, mode])
  const pieceSummary = segs.length === 1
    ? `1 piece — ${Math.round(runLength)}mm (no split)`
    : `${segs.length} pieces — ${segs.map(s => Math.round(s.len)).join(' / ')}mm`

  async function save() {
    setSaving(true)
    const mut = await dbUpdateKickRunSettings(runId, { max_segment_length: maxSeg, split_mode: mode })
    onSaved(mut)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onPointerDown={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-80 p-6 flex flex-col gap-4"
        onPointerDown={e => e.stopPropagation()}>
        <div>
          <p className="text-sm font-semibold text-white">Kick split</p>
          <p className="text-xs text-gray-400 mt-1">{Math.round(runLength)}mm run — split into manufacturable lengths</p>
        </div>

        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-300">Max segment length (mm)</span>
              <CalcInput
                value={maxSeg}
                onCommit={v => setMaxSeg(v > 0 ? v : null)}
                onClear={() => setMaxSeg(null)}
                min={0}
                decimals={1}
                placeholder="no split"
                className="w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white focus:border-blue-500 outline-none"
              />
              <span className="text-[11px] text-gray-500">Blank / 0 = one continuous piece</span>
            </label>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-300">Split mode</span>
              <div className="grid grid-cols-2 gap-2">
                {(['equal', 'exact'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-2 py-2 rounded-lg text-xs transition-colors ${
                      mode === m ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <span className="block font-semibold capitalize">{m}</span>
                    <span className="block text-[10px] opacity-80">
                      {m === 'equal' ? 'even pieces' : 'full + remainder'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-400">→ {pieceSummary}</p>
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
