'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import JointPreviewPanel from './JointPreviewPanel'
import type { JointOp3D } from './JointPreviewPanel'

// ── Types ─────────────────────────────────────────────────────────────────────

type TargetPart      = 'part_a' | 'part_b'
type MachineOp       = 'drill' | 'route' | 'pocket' | 'saw'
type FastenerType    = 'screw' | 'bolt' | 'dowel' | 'cam_lock' | 'biscuit' | 'staple' | 'bracket' | 'other'
type Tab             = 'joints' | 'fasteners'

interface JointType {
  id:          string
  name:        string
  description: string | null
}

interface JointTypeOperation {
  id:                string
  joint_type_id:     string
  operation_order:   number
  target_part:       TargetPart
  machine_operation: MachineOp
  tool_diameter_mm:  number
  depth_mm:          number
  offset_x_mm:       number
  offset_y_mm:       number
  offset_z_mm:       number
  notes:             string | null
}

interface Fastener {
  id:            string
  name:          string
  fastener_type: FastenerType
  diameter:      number | null
  length:        number | null
  brand:         string | null
  supplier_code: string | null
  cost_per_unit: number | null
  active:        boolean
  notes:         string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TARGET_PARTS: { value: TargetPart; label: string }[] = [
  { value: 'part_a', label: 'Master' },
  { value: 'part_b', label: 'Slave' },
]

const MACHINE_OPS: { value: MachineOp; label: string }[] = [
  { value: 'drill',  label: 'Drill' },
  { value: 'route',  label: 'Route' },
  { value: 'pocket', label: 'Pocket' },
  { value: 'saw',    label: 'Saw' },
]

const FASTENER_TYPES: { value: FastenerType; label: string }[] = [
  { value: 'screw',    label: 'Screw' },
  { value: 'bolt',     label: 'Bolt' },
  { value: 'dowel',    label: 'Dowel' },
  { value: 'cam_lock', label: 'Cam lock' },
  { value: 'biscuit',  label: 'Biscuit' },
  { value: 'staple',   label: 'Staple' },
  { value: 'bracket',  label: 'Bracket' },
  { value: 'other',    label: 'Other' },
]

const FASTENER_DEFAULTS: Omit<Fastener, 'id'> = {
  name: '', fastener_type: 'screw', diameter: null, length: null,
  brand: null, supplier_code: null, cost_per_unit: null, active: true, notes: null,
}

const OP_DEFAULTS: Omit<JointTypeOperation, 'id' | 'joint_type_id'> = {
  operation_order:   1,
  target_part:       'part_a',
  machine_operation: 'drill',
  tool_diameter_mm:  8,
  depth_mm:          15,
  offset_x_mm:       0,
  offset_y_mm:       0,
  offset_z_mm:       0,
  notes:             null,
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function toJointType(r: Record<string, unknown>): JointType {
  return { id: r.id as string, name: (r.name as string) ?? '', description: (r.description as string | null) ?? null }
}

function toOp(r: Record<string, unknown>): JointTypeOperation {
  return {
    id:                r.id as string,
    joint_type_id:     r.joint_type_id as string,
    operation_order:   r.operation_order as number,
    target_part:       r.target_part as TargetPart,
    machine_operation: r.machine_operation as MachineOp,
    tool_diameter_mm:  r.tool_diameter_mm as number,
    depth_mm:          r.depth_mm as number,
    offset_x_mm:       (r.offset_x_mm as number) ?? 0,
    offset_y_mm:       (r.offset_y_mm as number) ?? 0,
    offset_z_mm:       (r.offset_z_mm as number) ?? 0,
    notes:             (r.notes as string | null) ?? null,
  }
}

function toFastener(r: Record<string, unknown>): Fastener {
  return {
    id: r.id as string, name: (r.name as string) ?? '',
    fastener_type: (r.fastener_type as FastenerType) ?? 'screw',
    diameter: (r.diameter as number | null) ?? null, length: (r.length as number | null) ?? null,
    brand: (r.brand as string | null) ?? null, supplier_code: (r.supplier_code as string | null) ?? null,
    cost_per_unit: (r.cost_per_unit as number | null) ?? null, active: (r.active as boolean) ?? true,
    notes: (r.notes as string | null) ?? null,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function JointsClient({
  initialJoints    = [],
  initialFasteners = [],
  embedded,
}: {
  initialJoints?:    Record<string, unknown>[]
  initialFasteners?: Record<string, unknown>[]
  embedded?:         boolean
}) {
  const [tab,       setTab]       = useState<Tab>('joints')
  const [joints,    setJoints]    = useState<JointType[]>(initialJoints.map(toJointType))
  const [fasteners, setFasteners] = useState<Fastener[]>(initialFasteners.map(toFastener))
  const [selId,     setSelId]     = useState<string | null>(null)
  const [ops,       setOps]       = useState<JointTypeOperation[]>([])
  const [isNew,     setIsNew]     = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftDesc, setDraftDesc] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [nameDirty, setNameDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Load ─────────────────────────────────────────────────────────────────

  const reloadJoints = useCallback(async () => {
    const { data } = await supabase.from('joint_types').select('*').order('name')
    setJoints((data ?? []).map(toJointType))
  }, [])

  const reloadFasteners = useCallback(async () => {
    const { data } = await supabase.from('hardware_fasteners').select('*').order('name')
    setFasteners((data ?? []).map(toFastener))
  }, [])

  const loadOps = useCallback(async (typeId: string) => {
    const { data } = await supabase
      .from('joint_type_operations')
      .select('*')
      .eq('joint_type_id', typeId)
      .order('operation_order')
    setOps((data ?? []).map(toOp))
  }, [])

  useEffect(() => {
    if (embedded) { reloadJoints(); reloadFasteners() }
  }, [embedded, reloadJoints, reloadFasteners])

  // When selection changes, load ops
  useEffect(() => {
    if (isNew || !selId) { setOps([]); return }
    loadOps(selId)
  }, [selId, isNew, loadOps])

  // ── Joint type CRUD ───────────────────────────────────────────────────────

  function selectJoint(jt: JointType) {
    setSelId(jt.id)
    setIsNew(false)
    setDraftName(jt.name)
    setDraftDesc(jt.description ?? '')
    setNameDirty(false)
  }

  function startNew() {
    setSelId(null)
    setIsNew(true)
    setDraftName('')
    setDraftDesc('')
    setOps([])
    setNameDirty(false)
  }

  async function saveNameDesc() {
    if (!draftName.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      if (isNew) {
        const { data, error } = await supabase
          .from('joint_types')
          .insert({ name: draftName.trim(), description: draftDesc.trim() || null })
          .select('*').single()
        if (error) { setSaveError(error.message); return }
        if (data) {
          await reloadJoints()
          setIsNew(false)
          setSelId(data.id)
          setNameDirty(false)
        }
      } else if (selId) {
        const { error } = await supabase.from('joint_types')
          .update({ name: draftName.trim(), description: draftDesc.trim() || null, updated_at: new Date().toISOString() })
          .eq('id', selId)
        if (error) { setSaveError(error.message); return }
        await reloadJoints()
        setNameDirty(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteJointType(id: string) {
    if (!confirm('Delete this joint type and all its operations?')) return
    await supabase.from('joint_types').delete().eq('id', id)
    if (selId === id) { setSelId(null); setOps([]); setIsNew(false) }
    await reloadJoints()
  }

  // ── Operation CRUD ────────────────────────────────────────────────────────

  async function addOp() {
    if (!selId) return
    const nextOrder = ops.length > 0 ? Math.max(...ops.map(o => o.operation_order)) + 1 : 1
    const { data } = await supabase
      .from('joint_type_operations')
      .insert({ ...OP_DEFAULTS, joint_type_id: selId, operation_order: nextOrder })
      .select('*').single()
    if (data) setOps(prev => [...prev, toOp(data as Record<string, unknown>)])
  }

  async function patchOp(id: string, key: keyof JointTypeOperation, raw: string | number) {
    const numKeys: (keyof JointTypeOperation)[] = ['operation_order','tool_diameter_mm','depth_mm','offset_x_mm','offset_y_mm','offset_z_mm']
    const val = numKeys.includes(key) ? parseFloat(raw as string) : raw
    if (numKeys.includes(key) && isNaN(val as number)) return
    await supabase.from('joint_type_operations').update({ [key]: val }).eq('id', id)
    setOps(prev => prev.map(o => o.id === id ? { ...o, [key]: val } : o))
  }

  async function deleteOp(id: string) {
    await supabase.from('joint_type_operations').delete().eq('id', id)
    setOps(prev => prev.filter(o => o.id !== id))
  }

  // ── Fastener CRUD ─────────────────────────────────────────────────────────

  async function addFastener() {
    const { data } = await supabase.from('hardware_fasteners').insert(FASTENER_DEFAULTS).select('*').single()
    if (data) await reloadFasteners()
  }

  async function patchFastener(id: string, key: keyof Fastener, raw: string | boolean) {
    const numKeys: (keyof Fastener)[] = ['diameter','length','cost_per_unit']
    const val = numKeys.includes(key) ? (raw === '' ? null : parseFloat(raw as string)) : raw
    await supabase.from('hardware_fasteners').update({ [key]: val, updated_at: new Date().toISOString() }).eq('id', id)
    setFasteners(prev => prev.map(f => f.id === id ? { ...f, [key]: val } : f))
  }

  async function deleteFastener(id: string) {
    if (!confirm('Delete this fastener?')) return
    await supabase.from('hardware_fasteners').delete().eq('id', id)
    setFasteners(prev => prev.filter(f => f.id !== id))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const selJoint = selId ? joints.find(j => j.id === selId) : null

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {!embedded && (
        <div className="flex-none border-b border-gray-800 px-6 py-3 flex items-center gap-3">
          <Link href="/settings" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">← Settings</Link>
          <span className="text-gray-700">|</span>
          <Link href="/library/materials" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Materials</Link>
          <span className="text-gray-700">|</span>
          <Link href="/library/schedules" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Schedules</Link>
          <span className="text-gray-700">|</span>
          <Link href="/library/construction-methods" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Construction Methods</Link>
          <span className="text-gray-700">|</span>
          <span className="text-sm font-semibold text-white">Joints</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex-none border-b border-gray-800 px-6 flex gap-1 pt-1">
        {(['joints','fasteners'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-blue-500 text-blue-300' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}>
            {t === 'joints' ? 'Joint Types' : 'Fasteners'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden flex">

        {tab === 'joints' ? (
          <>
            {/* ── Left: joint type list ────────────────────────────────── */}
            <aside className="w-60 flex-none border-r border-gray-800 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Joint Types</span>
                <button onClick={startNew} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">+ New</button>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {joints.map(jt => (
                  <div key={jt.id}
                    className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                      selId === jt.id && !isNew ? 'bg-blue-600/15 text-blue-300' : 'text-gray-300 hover:bg-gray-800/60'
                    }`}
                    onClick={() => selectJoint(jt)}
                  >
                    <span className="flex-1 text-xs truncate">{jt.name}</span>
                    <button
                      onClick={e => { e.stopPropagation(); deleteJointType(jt.id) }}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all text-xs px-1"
                    >✕</button>
                  </div>
                ))}
                {joints.length === 0 && (
                  <p className="px-4 py-6 text-xs text-gray-600 text-center">No joint types yet.<br/>Click + New to create one.</p>
                )}
              </div>
            </aside>

            {/* ── Centre: editor ───────────────────────────────────────── */}
            {(!selId && !isNew) ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-gray-600">Select a joint type or click + New</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-8 py-6 min-w-0">
                <div className="max-w-2xl space-y-6">

                  {/* Header row */}
                  <div className="flex items-center gap-4">
                    <h2 className="text-sm font-semibold text-gray-200 flex-1">
                      {isNew ? 'New joint type' : (selJoint?.name ?? '')}
                    </h2>
                    <button
                      onClick={saveNameDesc}
                      disabled={saving || (!isNew && !nameDirty) || !draftName.trim()}
                      className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
                    >
                      {saving ? 'Saving…' : isNew ? 'Create' : 'Save name'}
                    </button>
                  </div>
                  {saveError && (
                    <p className="text-xs text-red-400 mt-1">{saveError}</p>
                  )}

                  {/* Identity */}
                  <Section label="Identity">
                    <Field label="Name">
                      <input
                        type="text" value={draftName}
                        onChange={e => { setDraftName(e.target.value); setNameDirty(true) }}
                        placeholder="e.g. cam_fixing, dowel_joint"
                        className={inpCls + ' w-full'}
                      />
                    </Field>
                    <Field label="Description">
                      <textarea
                        value={draftDesc}
                        onChange={e => { setDraftDesc(e.target.value); setNameDirty(true) }}
                        placeholder="What this joint is and when to use it"
                        rows={2}
                        className={inpCls + ' w-full resize-none'}
                      />
                    </Field>
                  </Section>

                  {/* Operations */}
                  {!isNew && (
                    <Section label="Operations" sublabel="The individual machine operations that make up this joint. Each operation targets either the Master or Slave part.">
                      <OpsTable ops={ops} onPatch={patchOp} onDelete={deleteOp} onAdd={addOp} />
                    </Section>
                  )}

                  {isNew && (
                    <p className="text-xs text-gray-600 italic">Create the joint type first, then add operations.</p>
                  )}

                </div>
              </div>
            )}

            {/* ── Right: preview panel (only when editing a saved joint) ── */}
            {selId && !isNew && (
              <JointPreviewPanel
                ops={ops.map((op): JointOp3D => ({
                  operation_order:   op.operation_order,
                  target_part:       op.target_part,
                  machine_operation: op.machine_operation,
                  tool_diameter_mm:  op.tool_diameter_mm,
                  depth_mm:          op.depth_mm,
                  offset_x_mm:       op.offset_x_mm,
                  offset_y_mm:       op.offset_y_mm,
                  offset_z_mm:       op.offset_z_mm,
                }))}
              />
            )}
          </>
        ) : (
          /* ── Fasteners tab ─────────────────────────────────────────── */
          <div className="flex-1 overflow-auto">
            <FastenersTable
              fasteners={fasteners}
              onChange={patchFastener}
              onAdd={addFastener}
              onDelete={deleteFastener}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Operations table ──────────────────────────────────────────────────────────

function OpsTable({
  ops, onPatch, onDelete, onAdd,
}: {
  ops:      JointTypeOperation[]
  onPatch:  (id: string, key: keyof JointTypeOperation, val: string | number) => void
  onDelete: (id: string) => void
  onAdd:    () => void
}) {
  const thCls = 'text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-1.5 whitespace-nowrap'
  const tdCls = 'px-2 py-1'
  const celCls = 'bg-gray-800/60 border border-transparent hover:border-gray-600 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-blue-500 w-full'
  const numCls = celCls + ' text-right font-mono'

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/50">
              <th className={thCls} style={{ width: 36 }}>#</th>
              <th className={thCls} style={{ width: 90 }}>Part</th>
              <th className={thCls} style={{ width: 90 }}>Operation</th>
              <th className={thCls} style={{ width: 76 }}>Ø dia mm</th>
              <th className={thCls} style={{ width: 76 }}>Depth mm</th>
              <th className={thCls} style={{ width: 68 }}>Offset X</th>
              <th className={thCls} style={{ width: 68 }}>Offset Y</th>
              <th className={thCls} style={{ width: 68 }}>Offset Z</th>
              <th className={thCls}>Notes</th>
              <th className={thCls} style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {ops.map((op, i) => (
              <tr key={op.id} className={`border-b border-gray-800/40 ${i % 2 === 0 ? '' : 'bg-gray-900/20'}`}>
                <td className={tdCls}>
                  <NumCell value={op.operation_order}
                    onChange={n => onPatch(op.id, 'operation_order', n)}
                    className={numCls} style={{ width: 36 }} />
                </td>
                <td className={tdCls}>
                  <select value={op.target_part}
                    onChange={e => onPatch(op.id, 'target_part', e.target.value)}
                    className={`${celCls} cursor-pointer`}>
                    {TARGET_PARTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </td>
                <td className={tdCls}>
                  <select value={op.machine_operation}
                    onChange={e => onPatch(op.id, 'machine_operation', e.target.value)}
                    className={`${celCls} cursor-pointer`}>
                    {MACHINE_OPS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </td>
                <td className={tdCls}>
                  <NumCell value={op.tool_diameter_mm}
                    onChange={n => onPatch(op.id, 'tool_diameter_mm', n)}
                    className={numCls} />
                </td>
                <td className={tdCls}>
                  <NumCell value={op.depth_mm}
                    onChange={n => onPatch(op.id, 'depth_mm', n)}
                    className={numCls} />
                </td>
                <td className={tdCls}>
                  <NumCell value={op.offset_x_mm}
                    onChange={n => onPatch(op.id, 'offset_x_mm', n)}
                    className={numCls} />
                </td>
                <td className={tdCls}>
                  <NumCell value={op.offset_y_mm}
                    onChange={n => onPatch(op.id, 'offset_y_mm', n)}
                    className={numCls} />
                </td>
                <td className={tdCls}>
                  <NumCell value={op.offset_z_mm}
                    onChange={n => onPatch(op.id, 'offset_z_mm', n)}
                    className={numCls} />
                </td>
                <td className={tdCls}>
                  <input type="text" value={op.notes ?? ''}
                    onChange={e => onPatch(op.id, 'notes', e.target.value)}
                    placeholder="e.g. cam barrel hole"
                    className={celCls} />
                </td>
                <td className={tdCls}>
                  <button onClick={() => onDelete(op.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors px-1">✕</button>
                </td>
              </tr>
            ))}
            {ops.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-xs text-gray-600">
                  No operations yet. Click + Add operation below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button onClick={onAdd}
        className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
        + Add operation
      </button>
    </div>
  )
}

// ── Fasteners table ───────────────────────────────────────────────────────────

function FastenersTable({
  fasteners, onChange, onAdd, onDelete,
}: {
  fasteners: Fastener[]
  onChange:  (id: string, key: keyof Fastener, val: string | boolean) => void
  onAdd:     () => void
  onDelete:  (id: string) => void
}) {
  const cols: {
    key: keyof Fastener; label: string; w: number
    type: 'text' | 'number' | 'select' | 'boolean'
    options?: { value: string; label: string }[]
  }[] = [
    { key: 'name',          label: 'Name',      w: 180, type: 'text' },
    { key: 'fastener_type', label: 'Type',      w: 110, type: 'select', options: FASTENER_TYPES },
    { key: 'diameter',      label: 'Dia mm',    w: 68,  type: 'number' },
    { key: 'length',        label: 'Length mm', w: 80,  type: 'number' },
    { key: 'brand',         label: 'Brand',     w: 110, type: 'text' },
    { key: 'supplier_code', label: 'Code',      w: 100, type: 'text' },
    { key: 'cost_per_unit', label: '$/unit',    w: 68,  type: 'number' },
    { key: 'notes',         label: 'Notes',     w: 150, type: 'text' },
    { key: 'active',        label: 'Active',    w: 48,  type: 'boolean' },
  ]

  const thCls  = 'text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-1.5 whitespace-nowrap'
  const tdCls  = 'px-2 py-1'
  const celCls = 'bg-gray-800/60 border border-transparent hover:border-gray-600 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-blue-500 w-full'

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Fasteners</p>
        <button onClick={onAdd}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors border border-gray-700 hover:border-blue-700 rounded px-3 py-1">
          + Add fastener
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-800">
              {cols.map(c => <th key={c.key} className={thCls} style={{ width: c.w }}>{c.label}</th>)}
              <th className={thCls} style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {fasteners.map(f => (
              <tr key={f.id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                {cols.map(c => (
                  <td key={c.key} className={tdCls}>
                    {c.type === 'boolean' ? (
                      <input type="checkbox" checked={f[c.key] as boolean}
                        onChange={e => onChange(f.id, c.key, e.target.checked)}
                        className="accent-blue-500 cursor-pointer" />
                    ) : c.type === 'select' ? (
                      <select value={(f[c.key] as string) ?? ''} onChange={e => onChange(f.id, c.key, e.target.value)}
                        className={`${celCls} cursor-pointer`}>
                        {c.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input
                        type={c.type === 'number' ? 'number' : 'text'}
                        value={(f[c.key] as string | number | null) ?? ''}
                        onChange={e => onChange(f.id, c.key, e.target.value)}
                        onFocus={e => e.target.select()}
                        className={celCls}
                      />
                    )}
                  </td>
                ))}
                <td className={tdCls}>
                  <button onClick={() => onDelete(f.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors text-xs px-1">✕</button>
                </td>
              </tr>
            ))}
            {fasteners.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="px-4 py-8 text-center text-xs text-gray-600">
                  No fasteners yet. Click + Add fastener.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── NumCell — local-draft numeric input ───────────────────────────────────────
// Holds a string draft while the user types; only calls onChange on blur / Enter.
// Selects all content on focus so typing immediately overwrites.

function NumCell({ value, onChange, className, style }: {
  value:     number
  onChange:  (n: number) => void
  className?: string
  style?:    React.CSSProperties
}) {
  const [draft,   setDraft]   = useState(String(value))
  const [focused, setFocused] = useState(false)

  // Sync display when the value changes externally (e.g. another user or reset)
  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [value, focused])

  function commit(raw: string) {
    const n = parseFloat(raw)
    if (!isNaN(n)) {
      onChange(n)
    } else {
      setDraft(String(value)) // revert to last good value
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      className={className}
      style={style}
      onChange={e => setDraft(e.target.value)}
      onFocus={e => { setFocused(true); e.target.select() }}
      onBlur={e  => { setFocused(false); commit(e.target.value) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function Section({ label, sublabel, children }: { label: string; sublabel?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        {sublabel && <p className="text-[10px] text-gray-600 mt-0.5">{sublabel}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-28 pt-1 text-xs text-gray-400 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

const inpCls = 'bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500'
