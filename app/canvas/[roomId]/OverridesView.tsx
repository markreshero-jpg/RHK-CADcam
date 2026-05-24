'use client'

import { useState, useEffect, type Dispatch, type SetStateAction } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { computeElevSeams } from '@/src/lib/cabinetSeams'
import type { CabinetCustomPart, PartPosOverrides } from './canvasDB'
import { dbSavePartPosOverride, dbDeletePartPosOverride, dbClearPartPosOverrides, dbUpdateCustomPart } from './canvasDB'

// ── Part label helper ─────────────────────────────────────────────────────────

const CASE_LABELS: Record<string, string> = {
  left_side: 'Left Gable', right_side: 'Right Gable', bottom: 'Bottom Panel',
  back: 'Back Panel', full_top: 'Top Panel', front_rail: 'Front Top Rail', back_rail: 'Back Top Rail',
}
const TK_LABELS: Record<string, string> = {
  kick_front_face: 'Toe Kick Face', kick_sub_front: 'Toe Kick Sub-Front',
  kick_back: 'Toe Kick Back', spreader_vertical: 'Toe Kick Leg', spreader_horizontal: 'Toe Kick Spreader',
}
const INT_LABELS: Record<string, string> = {
  adj_shelf: 'Adj. Shelf', fixed_shelf: 'Fixed Shelf',
  inner_drawer_bottom: 'Drawer Bottom', inner_drawer_back: 'Drawer Back',
}

function partIdLabel(id: string): string {
  if (id.startsWith('case_')) {
    const key = id.slice(5)
    return CASE_LABELS[key] ?? key.replace(/_/g, ' ')
  }
  if (id.startsWith('tk_')) {
    const rest = id.slice(3), cut = rest.lastIndexOf('_')
    return TK_LABELS[rest.slice(0, cut)] ?? rest.slice(0, cut).replace(/_/g, ' ')
  }
  if (id.startsWith('int_')) {
    const rest = id.slice(4), cut = rest.lastIndexOf('_')
    const idx = parseInt(rest.slice(cut + 1))
    return `${INT_LABELS[rest.slice(0, cut)] ?? rest.slice(0, cut).replace(/_/g, ' ')} ${idx + 1}`
  }
  if (id.startsWith('zone_')) {
    const [row, col] = id.slice(5).split('_').map(Number)
    return `Face R${row + 1}C${col + 1}`
  }
  if (id.startsWith('db_')) {
    const parts = id.slice(3).split('_')
    return `Drawer Box R${Number(parts[0]) + 1}C${Number(parts[1]) + 1}`
  }
  if (id.startsWith('slide_')) {
    const parts = id.slice(6).split('_')
    return `Slide (${parts[2]}) R${Number(parts[0]) + 1}C${Number(parts[1]) + 1}`
  }
  return id
}

// ── Resolved override row ─────────────────────────────────────────────────────

function OverrideRow({ partId, ov, cabinetId, partOverrides, onOverridesChange }: {
  partId: string
  ov: PartPosOverrides[string]
  cabinetId: string
  partOverrides: PartPosOverrides
  onOverridesChange: (o: PartPosOverrides) => void
}) {
  const [ox, setOx] = useState(ov.ox)
  const [oy, setOy] = useState(ov.oy)
  const [oz, setOz] = useState(ov.oz)
  const [oax, setOax] = useState(ov.oax ?? 0)
  const [oay, setOay] = useState(ov.oay ?? 0)
  const [oaz, setOaz] = useState(ov.oaz ?? 0)

  useEffect(() => {
    setOx(ov.ox); setOy(ov.oy); setOz(ov.oz)
    setOax(ov.oax ?? 0); setOay(ov.oay ?? 0); setOaz(ov.oaz ?? 0)
  }, [ov.ox, ov.oy, ov.oz, ov.oax, ov.oay, ov.oaz])

  function save(nx: number, ny: number, nz: number, nax = oax, nay = oay, naz = oaz) {
    const entry = { ox: nx, oy: ny, oz: nz, oax: nax, oay: nay, oaz: naz }
    const updated = { ...partOverrides, [partId]: entry }
    onOverridesChange(updated)
    dbSavePartPosOverride(cabinetId, partId, entry, partOverrides).catch(console.error)
  }

  function remove() {
    const { [partId]: _removed, ...updated } = partOverrides
    onOverridesChange(updated)
    dbDeletePartPosOverride(cabinetId, partId, partOverrides).catch(console.error)
  }

  const inputCls = 'w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs font-mono text-right text-white focus:outline-none focus:border-blue-500'

  function Field({ label, value, onChange, onSave, unit }: {
    label: string; value: number
    onChange: (v: number) => void; onSave: (v: number) => void; unit: string
  }) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-600 w-5">{label}</span>
        <input type="number" value={value} step="1"
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          onBlur={e => { const v = parseFloat(e.target.value) || 0; onChange(v); onSave(v) }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          onFocus={e => e.target.select()}
          className={inputCls} />
        <span className="text-[10px] text-gray-600">{unit}</span>
      </div>
    )
  }

  return (
    <tr className="border-t border-gray-800/60 hover:bg-gray-800/20 group">
      <td className="px-3 py-2 text-xs text-gray-300 font-medium align-top pt-3">{partIdLabel(partId)}</td>
      <td className="px-2 py-2" colSpan={3}>
        <div className="space-y-1">
          <Field label="X"  value={ox}  onChange={setOx}  onSave={v => save(v, oy, oz)}            unit="mm" />
          <Field label="Y"  value={oy}  onChange={setOy}  onSave={v => save(ox, v, oz)}            unit="mm" />
          <Field label="Z"  value={oz}  onChange={setOz}  onSave={v => save(ox, oy, v)}            unit="mm" />
          <div className="border-t border-gray-800/60 pt-1" />
          <Field label="AX" value={oax} onChange={setOax} onSave={v => save(ox, oy, oz, v, oay, oaz)} unit="°" />
          <Field label="AY" value={oay} onChange={setOay} onSave={v => save(ox, oy, oz, oax, v, oaz)} unit="°" />
          <Field label="AZ" value={oaz} onChange={setOaz} onSave={v => save(ox, oy, oz, oax, oay, v)} unit="°" />
        </div>
      </td>
      <td className="px-2 py-2 text-right align-top pt-3">
        <button onClick={remove}
          className="text-gray-600 hover:text-red-400 text-sm leading-none transition-colors opacity-0 group-hover:opacity-100"
          title="Remove override">✕</button>
      </td>
    </tr>
  )
}

// ── Custom part position row ──────────────────────────────────────────────────

function EditableName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)

  function commit() {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== value) onSave(v)
    else setDraft(value)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        className="bg-gray-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none w-36"
      />
    )
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true) }}
      title="Click to rename"
      className="text-left font-medium hover:text-blue-300 transition-colors"
    >
      {value}
    </button>
  )
}

function CustomPosRow({ part, setCustomParts }: {
  part: CabinetCustomPart
  setCustomParts: Dispatch<SetStateAction<CabinetCustomPart[]>>
}) {
  const [x, setX] = useState(part.x)
  const [y, setY] = useState(part.y)
  const [z, setZ] = useState(part.z)

  useEffect(() => { setX(part.x); setY(part.y); setZ(part.z) }, [part.x, part.y, part.z])

  function save(nx: number, ny: number, nz: number) {
    setCustomParts(prev => prev.map(p => p.id === part.id ? { ...p, x: nx, y: ny, z: nz } : p))
    dbUpdateCustomPart(part.id, { x: nx, y: ny, z: nz }).catch(console.error)
  }

  const inputCls = 'w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs font-mono text-right text-white focus:outline-none focus:border-blue-500'

  function Field({ label, value, onChange, onSave, unit }: {
    label: string; value: number
    onChange: (v: number) => void; onSave: (v: number) => void; unit: string
  }) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-600 w-5">{label}</span>
        <input type="number" value={value} step="1"
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          onBlur={e => { const v = parseFloat(e.target.value) || 0; onChange(v); onSave(v) }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          onFocus={e => e.target.select()}
          className={inputCls} />
        <span className="text-[10px] text-gray-600">{unit}</span>
      </div>
    )
  }

  return (
    <tr className="border-t border-gray-800/60 hover:bg-gray-800/20">
      <td className="px-3 py-2 text-xs text-gray-300 align-top pt-3">
        <EditableName
          value={part.name ?? 'Custom Part'}
          onSave={name => {
            setCustomParts(prev => prev.map(p => p.id === part.id ? { ...p, name } : p))
            dbUpdateCustomPart(part.id, { name }).catch(console.error)
          }}
        />
      </td>
      <td className="px-2 py-2" colSpan={3}>
        <div className="space-y-1">
          <Field label="X" value={x} onChange={setX} onSave={v => save(v, y, z)} unit="mm" />
          <Field label="Y" value={y} onChange={setY} onSave={v => save(x, v, z)} unit="mm" />
          <Field label="Z" value={z} onChange={setZ} onSave={v => save(x, y, v)} unit="mm" />
        </div>
      </td>
      <td />
    </tr>
  )
}

// ── Joint override rows ───────────────────────────────────────────────────────
// Per-cabinet carcase_joints entries — an explicit deviation from the construction
// method default: a joint-type override (green) or suppressed drilling (red).
// Removing a row reverts that seam to the method default.

function JointOverridesSection({ cabinet, rp, onUpdate }: {
  cabinet:  CabinetInstance
  rp:       ResolvedCabinet | undefined
  onUpdate: (id: string, u: Partial<CabinetInstance>) => void | Promise<void>
}) {
  const [jointNames, setJointNames] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    supabase.from('joint_types').select('id, name').then(({ data }) => {
      if (!cancelled) setJointNames(Object.fromEntries((data ?? []).map(j => [j.id, j.name])))
    })
    return () => { cancelled = true }
  }, [])

  const carcaseJoints = (cabinet.carcase_joints ?? {}) as Record<string, string | null>
  const entries = Object.entries(carcaseJoints)
  if (entries.length === 0) return null

  const labelByKey: Record<string, string> = {}
  if (rp) for (const s of computeElevSeams(rp)) labelByKey[s.key] = s.label

  function removeKey(key: string) {
    const { [key]: _removed, ...next } = carcaseJoints
    void onUpdate(cabinet.id, { carcase_joints: next })
  }

  return (
    <>
      <SectionHead color="#22c55e" title="Joint Overrides" count={entries.length} />
      {entries.map(([key, val]) => (
        <tr key={key} className="border-t border-gray-800/60 hover:bg-gray-800/20 group">
          <td className="px-3 py-2 text-xs text-gray-300 font-medium align-top pt-2.5">
            {labelByKey[key] ?? key.replace(/[:_]/g, ' ')}
          </td>
          <td className="px-2 py-2 text-xs align-top pt-2.5" colSpan={3}>
            {val === null
              ? <span className="text-red-400">Suppressed — no drilling</span>
              : <span className="text-green-400">{jointNames[val] ?? 'Assigned'}</span>}
          </td>
          <td className="px-2 py-2 text-right align-top pt-2.5">
            <button onClick={() => removeKey(key)}
              className="text-gray-600 hover:text-red-400 text-sm leading-none transition-colors opacity-0 group-hover:opacity-100"
              title="Revert to method default">✕</button>
          </td>
        </tr>
      ))}
    </>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHead({ color, title, count }: { color: string; title: string; count: number }) {
  return (
    <tr>
      <td colSpan={5} className="pt-5 pb-1 px-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-none" style={{ background: color }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</span>
          <span className="text-[10px] text-gray-600 ml-1">{count}</span>
        </div>
      </td>
    </tr>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function OverridesView({ cabinetId, partOverrides, onOverridesChange, customParts, setCustomParts, cabinet, rp, onUpdate }: {
  cabinetId: string
  partOverrides: PartPosOverrides
  onOverridesChange: (o: PartPosOverrides) => void
  customParts: CabinetCustomPart[]
  setCustomParts: Dispatch<SetStateAction<CabinetCustomPart[]>>
  cabinet?: CabinetInstance
  rp?: ResolvedCabinet
  onUpdate?: (id: string, u: Partial<CabinetInstance>) => void | Promise<void>
}) {
  const overrideEntries = Object.entries(partOverrides)
  const hasOverrides    = overrideEntries.length > 0
  const hasCustom       = customParts.length > 0
  const jointCount      = Object.keys(cabinet?.carcase_joints ?? {}).length
  const hasJoints       = jointCount > 0

  function clearAll() {
    onOverridesChange({})
    dbClearPartPosOverrides(cabinetId).catch(console.error)
    if (hasJoints && cabinet && onUpdate) void onUpdate(cabinet.id, { carcase_joints: {} })
  }

  return (
    <div className="w-full h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-gray-500">
          {overrideEntries.length} position override{overrideEntries.length !== 1 ? 's' : ''}
          {hasJoints ? ` · ${jointCount} joint override${jointCount !== 1 ? 's' : ''}` : ''}
          {hasCustom ? ` · ${customParts.length} custom part${customParts.length !== 1 ? 's' : ''}` : ''}
        </span>
        {(hasOverrides || hasJoints) && (
          <button onClick={clearAll}
            className="text-xs text-red-500 hover:text-red-300 transition-colors">
            Clear all overrides
          </button>
        )}
      </div>

      {!hasOverrides && !hasCustom && !hasJoints ? (
        <p className="text-xs text-gray-600 text-center pt-12">
          No overrides yet. Select a part to offset its position or set its edge joints.
        </p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Part</th>
              <th className="px-2 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider" colSpan={3}>X / Y / Z · AX / AY / AZ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {hasOverrides && (
              <>
                <SectionHead color="#f97316" title="Position Offsets" count={overrideEntries.length} />
                {overrideEntries.map(([partId, ov]) => (
                  <OverrideRow
                    key={partId}
                    partId={partId}
                    ov={ov}
                    cabinetId={cabinetId}
                    partOverrides={partOverrides}
                    onOverridesChange={onOverridesChange}
                  />
                ))}
              </>
            )}
            {hasJoints && cabinet && onUpdate && (
              <JointOverridesSection cabinet={cabinet} rp={rp} onUpdate={onUpdate} />
            )}
            {hasCustom && (
              <>
                <SectionHead color="#a78bfa" title="Custom Parts" count={customParts.length} />
                {customParts.map(p => (
                  <CustomPosRow key={p.id} part={p} setCustomParts={setCustomParts} />
                ))}
              </>
            )}
          </tbody>
        </table>
      )}
      <p className="mt-4 text-[10px] text-gray-600">
        All values in mm · X = left–right · Y = up–down · Z = front–back
      </p>
    </div>
  )
}
