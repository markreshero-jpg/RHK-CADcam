'use client'
// Waterfall skirt (edge.waterfall_skirt, z_benchtop_builder 2026-11-04): a shaped
// stone piece flush with the apron at one end of a waterfall leg, floor to the
// apron underside, curving up from `foot` on the floor to meet the apron `reach`
// from the corner. Used by the F4 edge panel and the benchtop panel's waterfall rows.
import type { BenchtopSegment, WaterfallSkirt } from '@/src/lib/types'
import { waterfallSkirt } from '@/src/lib/benchtopGeometry'

export default function WaterfallSkirtControls({ seg, index, count, onSet }: {
  seg: BenchtopSegment
  /** The waterfall edge's index (its neighbours name the two ends). */
  index: number
  count: number
  onSet: (skirt: WaterfallSkirt | null) => void
}) {
  const sk = waterfallSkirt(seg)
  const edgeNo = (side: 'start' | 'end') => ((index + (side === 'start' ? -1 : 1) + count) % count) + 1
  const num = (key: 'foot_mm' | 'reach_mm', label: string, title: string) => sk && (
    <label className="flex items-center gap-1 text-gray-400" title={title}>
      {label}
      <input key={`${index}-${key}-${sk[key]}`} type="number" min={0} step={10} defaultValue={sk[key]}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        onBlur={e => {
          const v = Math.max(0, Math.round(Number(e.target.value)))
          if (Number.isFinite(v) && v !== sk[key]) onSet({ ...sk, [key]: v })
        }}
        className="w-14 bg-gray-900 border border-gray-700 rounded px-1 text-gray-200" />
    </label>
  )
  return (
    <div className="flex flex-wrap items-center gap-1 text-[10px] w-full mt-1"
      title="Stone skirt flush with the apron at one end of the leg, floor to the apron underside, curving up to the apron">
      <label className="flex items-center gap-1 text-gray-400">
        <input type="checkbox" checked={!!sk}
          onChange={e => onSet(e.target.checked ? { side: 'start', foot_mm: 400, reach_mm: 2100 } : null)} />
        Skirt
      </label>
      {sk && (
        <select value={sk.side} onChange={e => onSet({ ...sk, side: e.target.value as 'start' | 'end' })}
          className="bg-gray-900 border border-gray-700 rounded px-1 text-gray-200"
          title="Which end of the leg: the skirt runs along that neighbouring edge">
          {(['start', 'end'] as const).map(side => <option key={side} value={side}>along edge {edgeNo(side)}</option>)}
        </select>
      )}
      {num('foot_mm', 'Foot', 'Where the curve meets the floor, from the leg’s outer face')}
      {num('reach_mm', 'Reach', 'Where the curve meets the apron underside, from the leg’s outer face')}
    </div>
  )
}
