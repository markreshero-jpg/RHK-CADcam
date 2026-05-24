'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { computeElevSeams, toGenericSeamKey } from '@/src/lib/cabinetSeams'

// Compact per-edge joint (drilling) control for the part properties panel.
// Lists every carcase seam that touches the selected case part and lets the user
// override the joint type, suppress drilling, or fall back to the construction
// method default — writing to cabinet.carcase_joints (same store as the Joints tab).

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

  const carcaseJoints = (cabinet.carcase_joints ?? {}) as Record<string, string | null>

  // Seams that involve the selected part (either side of "partA:partB").
  const seams = computeElevSeams(rp).filter(s => {
    const [a, b] = s.key.split(':')
    return a === partKey || b === partKey
  })

  function getSeamState(seamKey: string): { status: 'cabinet' | 'method' | 'suppressed' | 'none'; jointId: string | null } {
    const genericKey = toGenericSeamKey(seamKey)
    if (Object.prototype.hasOwnProperty.call(carcaseJoints, seamKey)) {
      const v = carcaseJoints[seamKey]
      return v === null ? { status: 'suppressed', jointId: null } : { status: 'cabinet', jointId: v }
    }
    const inherited = cmDefaults[seamKey] ?? cmDefaults[genericKey] ?? null
    return inherited ? { status: 'method', jointId: inherited } : { status: 'none', jointId: null }
  }

  function setSeamOverride(seamKey: string, value: string | null | 'clear') {
    const next = { ...carcaseJoints }
    if (value === 'clear') delete next[seamKey]
    else next[seamKey] = value
    void onUpdate(cabinet.id, { carcase_joints: next })
  }

  if (seams.length === 0) return null

  return (
    <div className="space-y-1.5">
      {seams.map(seam => {
        const state = getSeamState(seam.key)
        const jointName = state.jointId
          ? (jointTypes.find(j => j.id === state.jointId)?.name ?? state.jointId)
          : null
        const isSet = state.status === 'cabinet' || state.status === 'suppressed'
        const dotCls = state.status === 'cabinet'    ? 'bg-green-400'
                     : state.status === 'method'     ? 'bg-amber-400'
                     : state.status === 'suppressed' ? 'bg-red-400'
                     : 'bg-gray-600'

        // Edge label = the part on the other side of the seam.
        const [a, b] = seam.key.split(':')
        const other  = a === partKey ? b : a
        const edgeLabel = ({
          left_side: '→ Left Gable', right_side: '→ Right Gable',
          bottom: '→ Bottom', back: '→ Back',
          full_top: '→ Top', front_rail: '→ Top', back_rail: '→ Top',
        } as Record<string, string>)[other] ?? `→ ${other}`

        return (
          <div key={seam.key} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-none ${dotCls}`} />
              <span className="text-[10px] text-gray-400 flex-1 truncate">{edgeLabel}</span>
              {isSet && (
                <button
                  onClick={() => setSeamOverride(seam.key, 'clear')}
                  className="text-[9px] text-gray-500 hover:text-gray-300 transition-colors"
                >
                  default
                </button>
              )}
            </div>
            <div className="flex gap-1">
              <select
                value={state.status === 'cabinet' ? (state.jointId ?? '') : ''}
                onChange={e => setSeamOverride(seam.key, e.target.value || null)}
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
                onClick={() => setSeamOverride(seam.key, null)}
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
          </div>
        )
      })}
    </div>
  )
}
