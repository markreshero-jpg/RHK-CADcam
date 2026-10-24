'use client'

// Height split section of the cabinet panel (z_cabinet_split S2): the cut
// heights (from the cabinet's bottom, with the height off the floor), the
// fixed-shelf suggestions (3 below each shelf's top), add a second cut, remove.
// Writes `split` ({ at } — null removes it). The cut is drawn on the elevation.

import { useMemo } from 'react'
import type { CabinetInstance, Room, Wall } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'
import { normaliseSplit, splitSuggestions, MAX_CUTS, SPLIT_LIP } from '@/src/lib/cabinetSplit'
import { getCachedInput } from '@/src/lib/resolver/resolveCabinetFromDB'
import { resolveCabinet } from '@/src/lib/resolver/resolver'
import { cabBottomZ } from '@/src/lib/geometry'

const f1 = (n: number) => String(Math.round(n * 10) / 10)

export default function CabinetSplitSection({ cabinet, wall, room, onUpdate, inp, lbl }: {
  cabinet: CabinetInstance
  wall: Wall | null
  room: Room | null
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  inp: string
  lbl: string
}) {
  const split = normaliseSplit(cabinet.split)
  // Suggestions from the cabinet as resolved (its fixed shelves).
  const suggestions = useMemo(() => {
    const input = getCachedInput(cabinet.id)
    return input ? splitSuggestions(resolveCabinet(input).internal_parts) : []
  }, [cabinet.id, cabinet.dy, cabinet.internal_grid])
  if (!split) return null
  const at = split.at
  const put = (next: number[] | null) =>
    void onUpdate(cabinet.id, { split: next && next.length ? normaliseSplit({ at: next }) : null })
  const floor = room ? cabBottomZ(cabinet, room, wall) : 0
  const used = (v: number) => at.some(a => Math.abs(a - v) < 0.5)

  return (
    <div className="space-y-2 border-t border-gray-800 pt-3">
      <p className={lbl}>Height split</p>
      {at.map((h, i) => (
        <div key={i} className="grid grid-cols-[3.5rem_4.5rem_1fr_1.25rem] gap-1 items-center">
          <label className="text-xs text-gray-300">Cut {i + 1}</label>
          <CalcInput value={h} decimals={1}
            onCommit={v => { if (v > 0 && v < cabinet.dy) put(at.map((a, j) => (j === i ? v : a))) }}
            className={inp + ' text-right'} />
          <span className="text-[10px] text-gray-500">{f1(floor + h)} off the floor</span>
          <button onClick={() => put(at.filter((_, j) => j !== i))} title="Remove this cut"
            className="text-gray-500 hover:text-red-400 text-xs">✕</button>
        </div>
      ))}
      {suggestions.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">At a fixed shelf ({SPLIT_LIP} below its top):</p>
          <div className="flex flex-wrap gap-1">
            {suggestions.map(s => (
              <button key={s.shelf} disabled={used(s.at)}
                title={at.length < MAX_CUTS ? 'Add a cut here' : 'Move the last cut here'}
                onClick={() => put(at.length < MAX_CUTS ? [...at, s.at] : [...at.slice(0, -1), s.at])}
                className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40">
                Shelf {s.shelf} · {f1(s.at)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        {at.length < MAX_CUTS && (
          <button onClick={() => {
            // Next free suggestion, else the middle of the tallest piece.
            const free = suggestions.find(s => !used(s.at))
            const bounds = [0, ...at, cabinet.dy]
            let mid = cabinet.dy / 2, best = 0
            for (let i = 0; i < bounds.length - 1; i++) if (bounds[i + 1] - bounds[i] > best) { best = bounds[i + 1] - bounds[i]; mid = (bounds[i] + bounds[i + 1]) / 2 }
            put([...at, free ? free.at : Math.round(mid)])
          }} className="text-[10px] text-blue-400 hover:text-blue-300">+ Add cut</button>
        )}
        <button onClick={() => put(null)} className="text-[10px] text-red-400 hover:text-red-300">Remove split</button>
      </div>
      <p className="text-[10px] text-gray-600">Cuts the sides and back; heights from the cabinet&apos;s bottom. The fixed shelf stays with the lower section and stands {SPLIT_LIP} proud — the upper sides drop over it. Doors stay full height.</p>
    </div>
  )
}
