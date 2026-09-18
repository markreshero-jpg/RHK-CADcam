'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { computeElevSeams, internalSeamPartLabel, getSeamAssignState, withSeamJoint, withSeamRows } from '@/src/lib/cabinetSeams'
import { enumerateInternalSeams } from '@/src/lib/resolver/resolveJoints'
import { getCachedInput } from '@/src/lib/resolver/resolveCabinetFromDB'
import type { SeamJointAssign } from '@/src/lib/resolver/types'

// Compact per-edge joint (drilling) control for the part properties panel.
// Lists every seam that touches the selected part — carcase seams for case
// parts, plus internal seams (shelf ↔ support, division ↔ panel) for both the
// internal part itself and the supports it drills into — and lets the user
// override the joint type, suppress drilling, or fall back to the construction
// method default — writing to cabinet.carcase_joints (same store as the Joints tab).
// `partKey` is a case part_key ('left_side') or an internal seam key ('int_adj_shelf_0').

export default function PartEdgeJoints({ cabinet, rp, partKey, onUpdate }: {
  cabinet:  CabinetInstance
  rp:       ResolvedCabinet
  partKey:  string
  onUpdate: (id: string, u: Partial<CabinetInstance>) => void | Promise<void>
}) {
  const [jointTypes, setJointTypes] = useState<{ id: string; name: string }[]>([])
  const [cmDefaults, setCmDefaults] = useState<Record<string, string>>({})
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: jt }, { data: shop }] = await Promise.all([
        supabase.from('joint_types').select('id, name').order('name'),
        supabase.from('shop_settings').select('construction_schedule_id').limit(1).maybeSingle(),
      ])
      if (cancelled) return
      setJointTypes(jt ?? [])
      const schedId = shop?.construction_schedule_id
      if (schedId) {
        const rawCls = cabinet.assembly_class.replace('_corner', '')
        const cls: 'base' | 'wall' | 'tall' =
          rawCls === 'base' || rawCls === 'wall' || rawCls === 'tall' ? rawCls : 'base'
        const { data: row } = await supabase
          .from('construction_method_schedule_rows')
          .select('joint_defaults')
          .eq('schedule_id', schedId)
          .eq('assembly_class', cls)
          .maybeSingle()
        if (!cancelled) setCmDefaults((row?.joint_defaults ?? {}) as Record<string, string>)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [cabinet.assembly_class])

  const carcaseJoints = (cabinet.carcase_joints ?? {}) as Record<string, SeamJointAssign>

  // Carcase seams that involve the selected part (either side of "partA:partB").
  const seams = computeElevSeams(rp).filter(s => {
    const [a, b] = s.key.split(':')
    return a === partKey || b === partKey
  })

  // Internal seams touching the selected part: the part's own seams (shelf →
  // supports, division → panels) plus, for supports (gables/divisions/bottom/
  // top), the shelf/division seams that drill INTO them.
  const adjDrillEffective = ((cabinet.rule_overrides ?? {}) as Record<string, unknown>).ADJ_DRILL as string | undefined
    ?? (getCachedInput(cabinet.id)?.rules?.ADJ_DRILL as string | undefined)
    ?? 'per_shelf'
  const internalSeams = enumerateInternalSeams(rp.case_parts, rp.internal_parts, {
    adjFullBank: adjDrillEffective === 'full_bank',
  }).filter(c => c.part_a_key === partKey || c.part_b_key === partKey)

  const getSeamState = (seamKey: string) => getSeamAssignState(carcaseJoints, cmDefaults, seamKey)

  function setSeamOverride(seamKey: string, value: string | null | 'clear') {
    void onUpdate(cabinet.id, { carcase_joints: withSeamJoint(carcaseJoints, seamKey, value) })
  }

  function setSeamRows(seamKey: string, raw: string) {
    const n = parseInt(raw, 10)
    void onUpdate(cabinet.id, { carcase_joints: withSeamRows(carcaseJoints, seamKey, Number.isFinite(n) && n > 0 ? n : undefined) })
  }

  // Unified row list: carcase seams (label = the part on the other side) then
  // internal seams (→ = this part drills into, ← = drilled into by).
  const rows: { key: string; label: string }[] = [
    ...seams.map(seam => {
      const [a, b] = seam.key.split(':')
      const other  = a === partKey ? b : a
      const label = ({
        left_side: '→ Left Gable', right_side: '→ Right Gable',
        bottom: '→ Bottom', back: '→ Back',
        full_top: '→ Top', front_rail: '→ Top', back_rail: '→ Top',
      } as Record<string, string>)[other] ?? `→ ${other}`
      return { key: seam.key, label }
    }),
    ...internalSeams.map(c => ({
      key: c.seam_key,
      label: c.part_a_key === partKey
        ? `→ ${internalSeamPartLabel(c.part_b_key)}${c.bank ? ' (bank)' : ''}`
        : `← ${c.bank ? 'Shelf Bank' : internalSeamPartLabel(c.part_a_key)}`,
    })),
  ]

  if (rows.length === 0) return null

  return (
    <div className="space-y-1.5">
      {rows.map(row => {
        const state = getSeamState(row.key)
        const jointName = state.jointId
          ? (jointTypes.find(j => j.id === state.jointId)?.name ?? state.jointId)
          : null
        const isSet = state.status === 'cabinet' || state.status === 'suppressed'
        const dotCls = state.status === 'cabinet'    ? 'bg-green-400'
                     : state.status === 'method'     ? 'bg-amber-400'
                     : state.status === 'suppressed' ? 'bg-red-400'
                     : 'bg-gray-600'

        const edgeLabel = row.label

        return (
          <div key={row.key} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-none ${dotCls}`} />
              <span className="text-[10px] text-gray-400 flex-1 truncate">{edgeLabel}</span>
              {isSet && (
                <button
                  onClick={() => setSeamOverride(row.key, 'clear')}
                  className="text-[9px] text-gray-500 hover:text-gray-300 transition-colors"
                >
                  default
                </button>
              )}
            </div>
            <div className="flex gap-1">
              <select
                value={state.status === 'cabinet' ? (state.jointId ?? '') : ''}
                onChange={e => setSeamOverride(row.key, e.target.value || null)}
                disabled={loading}
                className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">
                  {state.status === 'method'     ? `${jointName} (method)`
                   : state.status === 'suppressed' ? 'Suppressed'
                   : 'Use method default'}
                </option>
                {jointTypes.map(j => (
                  <option key={j.id} value={j.id}>{j.name}</option>
                ))}
              </select>
              <button
                onClick={() => setSeamOverride(row.key, null)}
                title="Suppress — no drilling on this edge"
                className={`px-1.5 py-1 text-[10px] rounded border transition-colors shrink-0 ${
                  state.status === 'suppressed'
                    ? 'border-red-700 bg-red-900/30 text-red-300'
                    : 'border-gray-700 text-gray-500 hover:border-red-700 hover:bg-red-900/20 hover:text-red-300'
                }`}
              >
                ✕
              </button>
            </div>
            {row.key.startsWith('int_adj_shelf_') && state.status !== 'suppressed' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-gray-500 flex-1">Rows</span>
                <input
                  type="number" min={1} placeholder="auto"
                  value={state.rows ?? ''}
                  onChange={e => setSeamRows(row.key, e.target.value)}
                  className={`w-14 bg-gray-800 border rounded px-1.5 py-0.5 text-[10px] text-right focus:outline-none focus:border-blue-500 ${
                    state.rows ? 'border-green-700 text-green-300' : 'border-gray-700 text-white'
                  }`}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
