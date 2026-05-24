'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance } from '@/src/lib/types'
import { toGenericSeamKey } from '@/src/lib/cabinetSeams'

interface JointType {
  id: string
  name: string
  description: string | null
}

interface Props {
  cabId: string
  edgeKey: string
  edgeLabel: string
  cabinet: CabinetInstance
  onUpdate: (cabId: string, u: Partial<CabinetInstance>) => void
  onClose: () => void
}

const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500'
const btn = 'flex-1 px-3 py-1.5 text-xs rounded border border-gray-700 bg-gray-800 transition-colors'

export default function EdgeJointPicker({ cabId, edgeKey, edgeLabel, cabinet, onUpdate, onClose }: Props) {
  const [jointTypes,    setJointTypes]    = useState<JointType[]>([])
  const [inheritedId,   setInheritedId]   = useState<string | null>(null)
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    async function load() {
      // Joint types
      const { data: jt } = await supabase.from('joint_types').select('id, name, description').order('name')
      setJointTypes(jt ?? [])

      // Active construction method schedule → joint_defaults for this cabinet's assembly class
      const { data: shop } = await supabase
        .from('shop_settings').select('construction_schedule_id').limit(1).maybeSingle()
      const schedId = shop?.construction_schedule_id
      if (schedId) {
        const cls = cabinet.assembly_class.replace('_corner', '') as 'base' | 'wall' | 'tall'
        const validCls = ['base', 'wall', 'tall'].includes(cls) ? cls : 'base'
        const { data: row } = await supabase
          .from('construction_method_schedule_rows')
          .select('joint_defaults')
          .eq('schedule_id', schedId)
          .eq('assembly_class', validCls)
          .maybeSingle()
        const defaults = (row?.joint_defaults ?? {}) as Record<string, string>
        // Prefer the exact part-specific key (e.g. "full_top:left_side"), then generic
        const genericKey = toGenericSeamKey(edgeKey)
        setInheritedId(defaults[edgeKey] ?? defaults[genericKey] ?? null)
      }

      setLoading(false)
    }
    load()
  }, [edgeKey, cabinet.assembly_class])

  const existing: Record<string, string | null> = (cabinet.carcase_joints ?? {}) as Record<string, string | null>
  const isKeySet     = Object.prototype.hasOwnProperty.call(existing, edgeKey)
  const currentVal   = isKeySet ? existing[edgeKey] : undefined
  const hasJoint     = typeof currentVal === 'string'
  const isSuppressed = currentVal === null
  const isInherited  = !isKeySet && !!inheritedId

  function assign(jointTypeId: string) {
    onUpdate(cabId, { carcase_joints: { ...existing, [edgeKey]: jointTypeId } })
  }

  function suppress() {
    onUpdate(cabId, { carcase_joints: { ...existing, [edgeKey]: null } })
  }

  function clear() {
    const next = { ...existing }
    delete next[edgeKey]
    onUpdate(cabId, { carcase_joints: next })
  }

  const resolvedId    = hasJoint ? (currentVal as string) : isInherited ? inheritedId! : null
  const resolvedName  = resolvedId ? (jointTypes.find(j => j.id === resolvedId)?.name ?? 'Unknown') : null

  const statusLabel  = isSuppressed
    ? 'No drilling (suppressed)'
    : hasJoint
    ? resolvedName ?? 'Assigned'
    : isInherited
    ? `${resolvedName} (from method)`
    : 'No joint — unassigned'

  const statusColour = isSuppressed ? 'text-red-400'
    : hasJoint    ? 'text-green-400'
    : isInherited ? 'text-amber-400'
    : 'text-gray-500'

  return (
    <div className="w-64 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto shrink-0">

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-200">Edge Joint</p>
          <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{edgeLabel}</p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none shrink-0 mt-0.5">×</button>
      </div>

      <div className="p-4 space-y-4 flex-1">

        {/* Current status */}
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Current</p>
          {loading
            ? <p className="text-xs text-gray-600 italic">Loading…</p>
            : <p className={`text-xs font-medium ${statusColour}`}>{statusLabel}</p>
          }
        </div>

        {/* Override picker */}
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
            {isKeySet ? 'Override' : 'Override method default'}
          </p>
          {loading ? null : jointTypes.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No joint types in library yet.</p>
          ) : (
            <select
              value={hasJoint ? (currentVal as string) : ''}
              onChange={e => { if (e.target.value) assign(e.target.value) }}
              className={inp}
            >
              <option value="">{isInherited ? `Inherited: ${resolvedName}` : 'Select a joint type…'}</option>
              {jointTypes.map(j => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={suppress}
            title="No drilling on this edge — overrides the construction method default"
            className={`${btn} text-gray-400 hover:bg-red-900/40 hover:text-red-300 hover:border-red-800`}
          >
            No Joint
          </button>
          {isKeySet && (
            <button
              onClick={clear}
              title="Remove per-cabinet override — falls back to construction method default"
              className={`${btn} text-gray-400 hover:bg-gray-700 hover:text-gray-200`}
            >
              Use Default
            </button>
          )}
        </div>

        {/* Legend */}
        <div className="pt-2 border-t border-gray-800 space-y-1.5">
          <p className="text-[10px] text-gray-600 leading-snug">
            <span className="text-green-500 mr-1">●</span>Assigned — per-cabinet override
          </p>
          <p className="text-[10px] text-gray-600 leading-snug">
            <span className="text-amber-400 mr-1">●</span>From method — inherited default
          </p>
          <p className="text-[10px] text-gray-600 leading-snug">
            <span className="text-red-500 mr-1">●</span>No Joint — drilling suppressed
          </p>
          <p className="text-[10px] text-gray-600 leading-snug">
            <span className="text-gray-500 mr-1">○</span>Unassigned — no default set
          </p>
        </div>

      </div>
    </div>
  )
}
