'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { computeElevSeams, toGenericSeamKey } from '@/src/lib/cabinetSeams'

// Per-cabinet seam joint overrides. Inherits from construction method defaults;
// individual seams can be overridden (specific joint type) or suppressed (null).

export default function JointsPanel({ cabinet, rp, onUpdate }: {
  cabinet:  CabinetInstance
  rp:       ResolvedCabinet | undefined
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
}) {
  const [jointTypes, setJointTypes] = useState<{ id: string; name: string }[]>([])
  const [cmDefaults, setCmDefaults] = useState<Record<string, string>>({})
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: jt }, { data: shop }] = await Promise.all([
        supabase.from('joint_types').select('id, name').order('name'),
        supabase.from('shop_settings').select('construction_schedule_id').limit(1).maybeSingle(),
      ])
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
        setCmDefaults((row?.joint_defaults ?? {}) as Record<string, string>)
      }
      setLoading(false)
    }
    load()
  }, [cabinet.assembly_class])

  const carcaseJoints = (cabinet.carcase_joints ?? {}) as Record<string, string | null>
  const seams = rp ? computeElevSeams(rp) : []

  function getSeamState(seamKey: string): { status: 'cabinet' | 'method' | 'suppressed' | 'none'; jointId: string | null } {
    const genericKey = toGenericSeamKey(seamKey)
    if (Object.prototype.hasOwnProperty.call(carcaseJoints, seamKey)) {
      const v = carcaseJoints[seamKey]
      return v === null
        ? { status: 'suppressed', jointId: null }
        : { status: 'cabinet',   jointId: v }
    }
    const inherited = cmDefaults[seamKey] ?? cmDefaults[genericKey] ?? null
    return inherited
      ? { status: 'method', jointId: inherited }
      : { status: 'none',   jointId: null }
  }

  function setSeamOverride(seamKey: string, value: string | null | 'clear') {
    const next = { ...carcaseJoints }
    if (value === 'clear') delete next[seamKey]
    else next[seamKey] = value
    void onUpdate(cabinet.id, { carcase_joints: next })
  }

  if (!rp) {
    return (
      <div className="p-6 text-xs text-gray-500 italic">
        {loading ? 'Loading…' : 'Cabinet resolving — please wait a moment.'}
      </div>
    )
  }
  if (seams.length === 0) {
    return <div className="p-6 text-xs text-gray-500 italic">No carcase seams found for this cabinet.</div>
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="px-5 py-4">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Carcase Seam Joints</p>
        <p className="text-[10px] text-gray-600 mb-4 leading-snug">
          Override or suppress the joint type per seam. Unset seams inherit from the active construction method.
        </p>

        {jointTypes.length === 0 && !loading && (
          <p className="text-xs text-gray-600 italic mb-4">No joint types in library — add them in Library → Joints first.</p>
        )}

        <div className="space-y-1.5">
          {seams.map(seam => {
            const state    = getSeamState(seam.key)
            const jointName = state.jointId
              ? (jointTypes.find(j => j.id === state.jointId)?.name ?? state.jointId)
              : null
            const isSet = state.status === 'cabinet' || state.status === 'suppressed'

            const dotCls = state.status === 'cabinet'    ? 'bg-green-400'
                         : state.status === 'method'     ? 'bg-amber-400'
                         : state.status === 'suppressed' ? 'bg-red-400'
                         : 'bg-gray-700'

            return (
              <div key={seam.key}
                className={`rounded-lg px-3 py-2.5 transition-colors ${isSet ? 'bg-gray-800/70' : 'bg-gray-800/30 hover:bg-gray-800/50'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-none ${dotCls}`} />
                  <span className={`text-xs flex-1 ${isSet ? 'text-gray-200' : 'text-gray-400'}`}>
                    {seam.label}
                    {seam.isBack && <span className="ml-1 text-[10px] text-gray-600">(back)</span>}
                  </span>
                  {isSet && (
                    <button
                      onClick={() => setSeamOverride(seam.key, 'clear')}
                      className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Use default
                    </button>
                  )}
                </div>

                <div className="flex gap-1.5">
                  <select
                    value={state.status === 'cabinet' ? (state.jointId ?? '') : ''}
                    onChange={e => setSeamOverride(seam.key, e.target.value || null)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 min-w-0"
                  >
                    <option value="">
                      {state.status === 'method'     ? `← ${jointName} (method default)`
                       : state.status === 'suppressed' ? 'No joint (suppressed)'
                       : '— Use method default —'}
                    </option>
                    {jointTypes.map(j => (
                      <option key={j.id} value={j.id}>{j.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSeamOverride(seam.key, null)}
                    title="Suppress — no joint on this seam"
                    className={`px-2 py-1 text-xs rounded border transition-colors shrink-0 ${
                      state.status === 'suppressed'
                        ? 'border-red-700 bg-red-900/30 text-red-300'
                        : 'border-gray-600 text-gray-500 hover:border-red-700 hover:bg-red-900/20 hover:text-red-300'
                    }`}
                  >
                    ✕
                  </button>
                </div>

                {state.status === 'cabinet' && (
                  <p className="text-[10px] mt-1.5 text-green-500">Override: {jointName}</p>
                )}
                {state.status === 'method' && (
                  <p className="text-[10px] mt-1.5 text-amber-500">Inherited: {jointName}</p>
                )}
                {state.status === 'suppressed' && (
                  <p className="text-[10px] mt-1.5 text-red-500">Suppressed — no joint on this seam</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
