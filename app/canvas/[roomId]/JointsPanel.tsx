'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { computeElevSeams, internalSeamPartLabel, getSeamAssignState, withSeamJoint, withSeamRows } from '@/src/lib/cabinetSeams'
import { enumerateInternalSeams, type InternalSeamCandidate } from '@/src/lib/resolver/resolveJoints'
import { getCachedInput } from '@/src/lib/resolver/resolveCabinetFromDB'
import type { SeamJointAssign } from '@/src/lib/resolver/types'

// Per-cabinet seam joint overrides. Inherits from construction method defaults;
// individual seams can be overridden (specific joint type) or suppressed (null).

function internalSeamLabel(c: InternalSeamCandidate): string {
  const a = c.bank ? 'Shelf Bank' : internalSeamPartLabel(c.part_a_key)
  return `${a} → ${internalSeamPartLabel(c.part_b_key)}`
}

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

  const carcaseJoints = (cabinet.carcase_joints ?? {}) as Record<string, SeamJointAssign>
  const seams = rp ? computeElevSeams(rp) : []

  // Effective shelf-drilling mode: cabinet override, else the merged rules from
  // the cached resolve input (method/job/room cascade).
  const ruleOverrides = (cabinet.rule_overrides ?? {}) as Record<string, unknown>
  const adjDrillOverride = ruleOverrides.ADJ_DRILL as string | undefined
  const adjDrillEffective = adjDrillOverride
    ?? (getCachedInput(cabinet.id)?.rules?.ADJ_DRILL as string | undefined)
    ?? 'per_shelf'
  const internalSeams = rp
    ? enumerateInternalSeams(rp.case_parts, rp.internal_parts, { adjFullBank: adjDrillEffective === 'full_bank' })
    : []

  function setAdjDrill(value: string) {
    const next = { ...ruleOverrides }
    if (!value) delete next.ADJ_DRILL
    else next.ADJ_DRILL = value
    void onUpdate(cabinet.id, { rule_overrides: next } as Partial<CabinetInstance>)
  }

  const getSeamState = (seamKey: string) => getSeamAssignState(carcaseJoints, cmDefaults, seamKey)

  function setSeamOverride(seamKey: string, value: string | null | 'clear') {
    void onUpdate(cabinet.id, { carcase_joints: withSeamJoint(carcaseJoints, seamKey, value) })
  }

  function setSeamRows(seamKey: string, raw: string) {
    const n = parseInt(raw, 10)
    void onUpdate(cabinet.id, { carcase_joints: withSeamRows(carcaseJoints, seamKey, Number.isFinite(n) && n > 0 ? n : undefined) })
  }

  function setAdjRows(raw: string) {
    const n = parseInt(raw, 10)
    const next = { ...ruleOverrides }
    if (Number.isFinite(n) && n > 0) next.ADJ_ROWS = n
    else delete next.ADJ_ROWS
    void onUpdate(cabinet.id, { rule_overrides: next } as Partial<CabinetInstance>)
  }

  if (!rp) {
    return (
      <div className="p-6 text-xs text-gray-500 italic">
        {loading ? 'Loading…' : 'Cabinet resolving — please wait a moment.'}
      </div>
    )
  }
  if (seams.length === 0 && internalSeams.length === 0) {
    return <div className="p-6 text-xs text-gray-500 italic">No seams found for this cabinet.</div>
  }

  const renderSeamRow = (key: string, label: string, note?: string) => {
    const state    = getSeamState(key)
    const jointName = state.jointId
      ? (jointTypes.find(j => j.id === state.jointId)?.name ?? state.jointId)
      : null
    const isSet = state.status === 'cabinet' || state.status === 'suppressed'

    const dotCls = state.status === 'cabinet'    ? 'bg-green-400'
                 : state.status === 'method'     ? 'bg-amber-400'
                 : state.status === 'suppressed' ? 'bg-red-400'
                 : 'bg-gray-700'

    return (
      <div key={key}
        className={`rounded-lg px-3 py-2.5 transition-colors ${isSet ? 'bg-gray-800/70' : 'bg-gray-800/30 hover:bg-gray-800/50'}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-1.5 h-1.5 rounded-full flex-none ${dotCls}`} />
          <span className={`text-xs flex-1 ${isSet ? 'text-gray-200' : 'text-gray-400'}`}>
            {label}
            {note && <span className="ml-1 text-[10px] text-gray-600">({note})</span>}
          </span>
          {isSet && (
            <button
              onClick={() => setSeamOverride(key, 'clear')}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Use default
            </button>
          )}
        </div>

        <div className="flex gap-1.5">
          <select
            value={state.status === 'cabinet' ? (state.jointId ?? '') : ''}
            onChange={e => setSeamOverride(key, e.target.value || null)}
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
            onClick={() => setSeamOverride(key, null)}
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

        {key.startsWith('int_adj_shelf_') && state.status !== 'suppressed' && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-gray-500 flex-1">Rows (this seam)</span>
            <input
              type="number" min={1} placeholder="auto"
              value={state.rows ?? ''}
              onChange={e => setSeamRows(key, e.target.value)}
              className={`w-16 bg-gray-700 border rounded px-2 py-0.5 text-[10px] text-right focus:outline-none focus:border-blue-500 ${
                state.rows ? 'border-green-700 text-green-300' : 'border-gray-600 text-white'
              }`}
            />
          </div>
        )}

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
          {seams.map(seam => renderSeamRow(seam.key, seam.label, seam.isBack ? 'back' : undefined))}
        </div>

        {(internalSeams.length > 0 || rp.internal_parts.some(p => p.part_type === 'adj_shelf')) && (
          <>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-6 mb-1">Internal Seam Joints</p>
            <p className="text-[10px] text-gray-600 mb-3 leading-snug">
              Shelf and division drilling for this cabinet only.
            </p>

            <div className="rounded-lg px-3 py-2.5 bg-gray-800/30 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs flex-1 text-gray-400">Shelf drilling layout</span>
                <select
                  value={adjDrillOverride ?? ''}
                  onChange={e => setAdjDrill(e.target.value)}
                  className="w-44 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">— Inherit from method —</option>
                  <option value="per_shelf">Per shelf (cluster)</option>
                  <option value="full_bank">Full bank (line bore)</option>
                </select>
              </div>
              <p className={`text-[10px] mt-1.5 ${adjDrillOverride ? 'text-green-500' : 'text-gray-600'}`}>
                Effective: {adjDrillEffective === 'full_bank' ? 'Full bank (line bore)' : 'Per shelf (cluster)'}
                {adjDrillOverride ? ' — cabinet override' : ''}
              </p>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700/60">
                <span className="text-xs flex-1 text-gray-400">Rows — all shelves</span>
                <input
                  type="number" min={1} placeholder="auto"
                  value={(ruleOverrides.ADJ_ROWS as number | undefined) ?? ''}
                  onChange={e => setAdjRows(e.target.value)}
                  className={`w-16 bg-gray-700 border rounded px-2 py-1 text-xs text-right focus:outline-none focus:border-blue-500 ${
                    ruleOverrides.ADJ_ROWS ? 'border-green-700 text-green-300' : 'border-gray-600 text-white'
                  }`}
                />
              </div>
              <p className="text-[10px] mt-1 text-gray-600 leading-snug">
                Blank = joint default (cluster) / pitch-filled (bank). Individual seams below can override.
              </p>
            </div>

            <div className="space-y-1.5">
              {internalSeams.map(c => renderSeamRow(c.seam_key, internalSeamLabel(c), c.bank ? 'bank' : undefined))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
