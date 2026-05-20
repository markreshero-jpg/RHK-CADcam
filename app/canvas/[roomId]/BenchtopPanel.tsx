'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import { BenchtopInstance, BenchtopBuildMethod } from '@/src/lib/types'
import { resolveBenchtopFromDB, loadResolvedParts } from '@/src/lib/benchtop-resolver/resolveBenchtopFromDB'
import type { ResolvedBenchtopPart } from '@/src/lib/benchtop-resolver/types'

interface BenchtopSchedule { id: string; name: string }

const ROLE_LABELS: Record<string, string> = {
  worktop_panel:         'Worktop Panel',
  buildup_rail:          'Build-Up Rail',
  buildup_cross_member:  'Cross Member',
  subtop:                'Subtop',
  drop_front_fascia:     'Drop Front',
  side_fascia:           'Side Fascia',
  back_fascia:           'Back Fascia',
  stone_slab:            'Stone Slab',
}

export default function BenchtopPanel({
  benchtop, onUpdate, onDelete,
  filletRadius, setFilletRadius,
  onMirrorH, onMirrorV, onOffset, onRotate,
  onDeleteCutout, onDrawCutoutRect, onDrawCutoutCircle,
}: {
  benchtop: BenchtopInstance
  onUpdate: (id: string, u: Partial<BenchtopInstance>) => Promise<void>
  onDelete: (id: string) => void
  filletRadius: number
  setFilletRadius: (r: number) => void
  onMirrorH: (id: string) => void
  onMirrorV: (id: string) => void
  onOffset: (id: string, amount: number) => void
  onRotate: (id: string, angleDeg: number) => void
  onDeleteCutout: (id: string, i: number) => void
  onDrawCutoutRect: () => void
  onDrawCutoutCircle: () => void
}) {
  const [label, setLabel] = useState(benchtop.label ?? '')
  const [methods, setMethods] = useState<BenchtopBuildMethod[]>([])
  const [schedules, setSchedules] = useState<BenchtopSchedule[]>([])
  const [parts, setParts] = useState<ResolvedBenchtopPart[]>([])
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [offsetAmt, setOffsetAmt] = useState(0)
  const [rotateAmt, setRotateAmt] = useState(0)

  useEffect(() => {
    setLabel(benchtop.label ?? '')
  }, [benchtop.id, benchtop.label])

  useEffect(() => {
    void supabase.from('benchtop_build_methods').select('*').eq('active', true).order('name')
      .then(({ data }) => setMethods((data ?? []) as BenchtopBuildMethod[]))
    void supabase.from('benchtop_schedules').select('id, name').order('name')
      .then(({ data }) => setSchedules((data ?? []) as BenchtopSchedule[]))
    // Load any previously resolved parts
    void loadResolvedParts(benchtop.id).then(setParts)
  }, [benchtop.id])

  async function handleResolve() {
    if (benchtop.polygon.length < 3) {
      setResolveError('Benchtop must have at least 3 vertices before resolving.')
      return
    }
    setResolving(true)
    setResolveError(null)
    try {
      const result = await resolveBenchtopFromDB(benchtop.id)
      if (result === null) {
        setResolveError('Could not resolve — make sure a Build Method is assigned (at benchtop, room, or job level).')
      } else {
        setParts(result)
      }
    } finally {
      setResolving(false)
    }
  }

  const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500'
  const lbl = 'text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 block'

  const n = benchtop.polygon.length
  const exposedCount = n - benchtop.edge_tags.filter(t => t.type === 'wall').length
  const mitreCount   = benchtop.join_types.filter(j => j.join_type === 'mitre').length

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-300">Benchtop</p>
          <p className="text-[10px] text-gray-500">{n} vertices</p>
        </div>
        <button onClick={() => onDelete(benchtop.id)} className="text-gray-600 hover:text-red-400 text-xs" title="Delete">✕</button>
      </div>

      <div className="p-4 space-y-3">

        {/* Label */}
        <div>
          <label className={lbl}>Label</label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            onBlur={() => { if (label !== (benchtop.label ?? '')) void onUpdate(benchtop.id, { label: label || null }) }}
            className={inp}
          />
        </div>

        {/* Build Method */}
        <div>
          <label className={lbl}>Build Method</label>
          <select
            value={benchtop.benchtop_build_method_id ?? ''}
            onChange={e => void onUpdate(benchtop.id, { benchtop_build_method_id: e.target.value || null })}
            className={inp}
          >
            <option value="">(inherit from job / room)</option>
            {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        {/* Schedule */}
        <div>
          <label className={lbl}>Material Schedule</label>
          <select
            value={benchtop.benchtop_schedule_id ?? ''}
            onChange={e => void onUpdate(benchtop.id, { benchtop_schedule_id: e.target.value || null })}
            className={inp}
          >
            <option value="">(inherit from job / room)</option>
            {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Edge tags */}
        <div className="border-t border-gray-800 pt-3 space-y-1.5">
          <p className={lbl}>Edge Tags</p>
          <div className="text-xs text-gray-400 flex gap-3">
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-teal-500 mr-1 align-middle" />{exposedCount} exposed</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-600 mr-1 align-middle" />{n - exposedCount} wall</span>
          </div>
          <p className="text-[10px] text-gray-600">Click edge midpoints on plan to toggle</p>
        </div>

        {/* Join points */}
        <div className="border-t border-gray-800 pt-3 space-y-1.5">
          <p className={lbl}>Join Points</p>
          <div className="text-xs text-gray-400 flex gap-3">
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-teal-500 mr-1 align-middle" />{n - mitreCount} butt</span>
            <span><span className="inline-block w-2.5 h-2.5 rotate-45 bg-amber-500 mr-1 align-middle" style={{ display: 'inline-block' }} />{mitreCount} mitre</span>
          </div>
          <p className="text-[10px] text-gray-600">Click vertex dots on plan to toggle</p>
        </div>

        {/* ── Transform ── */}
        <div className="border-t border-gray-800 pt-3 space-y-2">
          <p className={lbl}>Transform</p>

          {/* Rotate */}
          <div>
            <label className={lbl}>Rotate (°)</label>
            <div className="flex gap-1">
              <input type="number" value={rotateAmt} onChange={e => setRotateAmt(Number(e.target.value))}
                className={inp + ' flex-1'} placeholder="0" />
              <button onClick={() => { onRotate(benchtop.id, rotateAmt); setRotateAmt(0) }}
                className="px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
                Apply
              </button>
            </div>
            <div className="flex gap-1 mt-1">
              {[45, 90, -90, 180].map(a => (
                <button key={a} onClick={() => onRotate(benchtop.id, a)}
                  className="flex-1 px-1 py-0.5 rounded text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300">
                  {a > 0 ? `+${a}°` : `${a}°`}
                </button>
              ))}
            </div>
          </div>

          {/* Mirror */}
          <div>
            <label className={lbl}>Mirror</label>
            <div className="flex gap-1">
              <button onClick={() => onMirrorH(benchtop.id)}
                className="flex-1 px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
                ↔ Horizontal
              </button>
              <button onClick={() => onMirrorV(benchtop.id)}
                className="flex-1 px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
                ↕ Vertical
              </button>
            </div>
          </div>

          {/* Offset */}
          <div>
            <label className={lbl}>Offset shape (mm)</label>
            <div className="flex gap-1">
              <input type="number" value={offsetAmt} onChange={e => setOffsetAmt(Number(e.target.value))}
                className={inp + ' flex-1'} placeholder="0" />
              <button onClick={() => { if (offsetAmt !== 0) { onOffset(benchtop.id, offsetAmt); setOffsetAmt(0) } }}
                className="px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
                Apply
              </button>
            </div>
            <p className="text-[10px] text-gray-600">+ expands · − shrinks</p>
          </div>

          {/* Fillet radius */}
          <div>
            <label className={lbl}>Corner radius (mm)</label>
            <div className="flex gap-1">
              <input type="number" value={filletRadius} min={1} max={500}
                onChange={e => setFilletRadius(Math.max(1, Number(e.target.value)))}
                className={inp + ' flex-1'} />
              <span className="text-[10px] text-gray-500 self-center pr-1">used by<br/>Round/Chamfer</span>
            </div>
          </div>
        </div>

        {/* ── Cutouts ── */}
        <div className="border-t border-gray-800 pt-3 space-y-2">
          <p className={lbl}>Cutouts</p>
          <div className="flex gap-1">
            <button onClick={onDrawCutoutRect}
              className="flex-1 px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
              + Rect
            </button>
            <button onClick={onDrawCutoutCircle}
              className="flex-1 px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
              + Circle
            </button>
          </div>
          {(benchtop.cutout_polygons ?? []).length === 0 && (
            <p className="text-[10px] text-gray-600">No cutouts</p>
          )}
          {(benchtop.cutout_polygons ?? []).map((cut, i) => (
            <div key={i} className="flex items-center justify-between bg-gray-800 rounded px-2 py-1 text-[10px]">
              <span className="text-gray-400">Cutout {i + 1} · {cut.length} pts</span>
              <button onClick={() => onDeleteCutout(benchtop.id, i)}
                className="text-red-500 hover:text-red-400 ml-2">✕</button>
            </div>
          ))}
        </div>

        {/* Notes */}
        <div className="border-t border-gray-800 pt-3">
          <label className={lbl}>Notes</label>
          <textarea
            defaultValue={benchtop.notes ?? ''}
            onBlur={e => void onUpdate(benchtop.id, { notes: e.target.value || null })}
            rows={2}
            className={inp + ' resize-none'}
          />
        </div>

        {/* ── Resolver ── */}
        <div className="border-t border-gray-800 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className={lbl}>Parts List</p>
            {parts.length > 0 && (
              <span className="text-[10px] text-teal-500">{parts.length} parts</span>
            )}
          </div>
          <button
            onClick={handleResolve}
            disabled={resolving}
            className="w-full px-3 py-1.5 rounded text-xs font-medium bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-50 transition-colors"
          >
            {resolving ? 'Resolving…' : 'Resolve Parts'}
          </button>
          {resolveError && (
            <p className="text-[10px] text-red-400">{resolveError}</p>
          )}

          {parts.length > 0 && (
            <div className="space-y-1 pt-1">
              {parts.map((p, i) => (
                <div key={i} className="bg-gray-800 rounded px-2 py-1.5 text-[10px]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-gray-300 truncate">{p.label}</span>
                    {p.quantity > 1 && <span className="text-teal-500 shrink-0">×{p.quantity}</span>}
                  </div>
                  <div className="text-gray-500 mt-0.5">
                    {p.length_mm} × {p.width_mm} × {p.thickness_mm} mm
                  </div>
                  {(p.material_name ?? p.benchtop_material_name) && (
                    <div className="text-gray-600 truncate">
                      {p.material_name ?? p.benchtop_material_name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
