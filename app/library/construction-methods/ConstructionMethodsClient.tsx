'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const Cabinet3DView = dynamic(() => import('@/app/canvas/[roomId]/Cabinet3DView'), { ssr: false })
import { supabase } from '@/src/lib/supabase'
import {
  ConstructionRules, DEFAULT_RULES, EdgingDefaults, DEFAULT_EDGING, EdgeSides,
  CabinetInput, Material,
  ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart, ResolvedInternalPart, ResolvedFaceZone,
  JointTypeOp, JointTargetPart, JointMachineOp, JointFace,
} from '@/src/lib/resolver/types'
import { resolveCabinet } from '@/src/lib/resolver/resolver'
import { DEFAULT_DIMS } from '@/src/lib/types'
import type { CabinetInstance } from '@/src/lib/types'
import {
  RuleKey, EdgingKey,
  RULE_LABELS, RULE_GROUPS,
  EDGING_LABELS, EDGING_GROUPS, EDGE_SIDES, EDGE_LABELS,
  effectiveRule, effectiveEdgeSides, sidesEqual, computeDelta,
} from '@/src/lib/constructionRuleConfig'
import { carcaseSeamParts } from '@/src/lib/cabinetSeams'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Schedule {
  id: string
  name: string
  is_default: boolean
}

type AssClass = 'base' | 'wall' | 'tall'

const CLASS_LABELS: Record<AssClass, string> = { base: 'Base', wall: 'Wall', tall: 'Tall' }

// Delta = only the keys that differ from DEFAULT_RULES
type RuleDelta = Partial<ConstructionRules>
type ClassDeltas = Record<AssClass, RuleDelta>

function emptyDeltas(): ClassDeltas {
  return { base: {}, wall: {}, tall: {} }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConstructionMethodsClient({ embedded }: { embedded?: boolean }) {
  const [schedules,    setSchedules]    = useState<Schedule[]>([])
  const [selId,        setSelId]        = useState<string | null>(null)
  const [schedName,    setSchedName]    = useState('')
  const [classTab,     setClassTab]     = useState<AssClass>('base')
  const [deltas,       setDeltas]       = useState<ClassDeltas>(emptyDeltas())
  const [dirty,        setDirty]        = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [newName,      setNewName]      = useState('')
  const [creating,     setCreating]     = useState(false)
  const [shopSchedId,  setShopSchedId]  = useState<string | null>(null)
  const [viewMode,     setViewMode]     = useState<'questions' | 'rules'>('questions')
  const [hoverParts,   setHoverParts]   = useState<string[] | null>(null)
  const [jointDeltas,  setJointDeltas]  = useState<Record<AssClass, Record<string, string>>>({ base: {}, wall: {}, tall: {} })
  const [jointTypes,   setJointTypes]   = useState<{ id: string; name: string }[]>([])
  const [jointTypeOps, setJointTypeOps] = useState<Record<string, JointTypeOp[]>>({})
  const [openJointPart, setOpenJointPart] = useState<string | null>(null)
  const [previewMats,  setPreviewMats]  = useState<Record<AssClass, Material>>({
    base: PREVIEW_MATERIAL, wall: PREVIEW_MATERIAL, tall: PREVIEW_MATERIAL,
  })

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadSchedules = useCallback(async () => {
    const [{ data: scheds }, { data: shop }] = await Promise.all([
      supabase.from('construction_method_schedules').select('id,name,is_default').order('name'),
      supabase.from('shop_settings').select('construction_schedule_id,assembly_schedule_id').limit(1).maybeSingle(),
    ])
    setSchedules(scheds ?? [])
    setShopSchedId(shop?.construction_schedule_id ?? null)

    // Load per-class interior material from the shop assembly schedule
    const asmSchedId = shop?.assembly_schedule_id
    if (asmSchedId) {
      const { data: rows } = await supabase
        .from('assembly_schedule_rows')
        .select('assembly_class,material_id')
        .eq('schedule_id', asmSchedId)
        .eq('material_role', 'interior')
      if (rows?.length) {
        const matIds = [...new Set(rows.map(r => r.material_id).filter(Boolean))]
        const { data: mats } = await supabase
          .from('materials').select('id,name,dz,face_colour,back_colour,edge_colour').in('id', matIds)
        if (mats?.length) {
          const byId = Object.fromEntries(mats.map(m => [m.id, m]))
          setPreviewMats(prev => {
            const next = { ...prev }
            for (const row of rows) {
              const cls = row.assembly_class as AssClass
              const mat = byId[row.material_id]
              if (mat && (cls === 'base' || cls === 'wall' || cls === 'tall')) {
                next[cls] = { id: mat.id, name: mat.name, DZ: mat.dz, sheet_dx: 2400, sheet_dy: 1200, has_grain: false, face_colour: mat.face_colour ?? undefined, back_colour: mat.back_colour ?? undefined, edge_colour: mat.edge_colour ?? undefined }
              }
            }
            return next
          })
        }
      }
    }
  }, [])

  useEffect(() => { loadSchedules() }, [loadSchedules])
  useEffect(() => {
    supabase.from('joint_types').select('id, name').order('name')
      .then(({ data }) => setJointTypes(data ?? []))
    // Load all joint operations so the preview can render actual drilling.
    supabase.from('joint_type_operations').select('*').order('operation_order')
      .then(({ data }) => {
        const map: Record<string, JointTypeOp[]> = {}
        for (const op of ((data ?? []) as Record<string, unknown>[])) {
          const jid = op.joint_type_id as string
          ;(map[jid] ??= []).push({
            id:                op.id as string,
            joint_type_id:     jid,
            operation_order:   op.operation_order as number,
            target_part:       op.target_part as JointTargetPart,
            machine_operation: op.machine_operation as JointMachineOp,
            face:              (op.face as JointFace) ?? 'normal',
            tool_diameter_mm:  op.tool_diameter_mm as number,
            depth_mm:          op.depth_mm as number,
            offset_x_mm:       (op.offset_x_mm as number) ?? 0,
            offset_y_mm:       (op.offset_y_mm as number) ?? 0,
            offset_z_mm:       (op.offset_z_mm as number) ?? 0,
            qty:               (op.qty as number) ?? 1,
            spacing_mm:        (op.spacing_mm as number | null) ?? null,
            tool:              (op.tool as string | null) ?? null,
            notes:             (op.notes as string | null) ?? null,
            expressions:       (op.expressions as Record<string, string> | null) ?? null,
          })
        }
        setJointTypeOps(map)
      })
  }, [])

  useEffect(() => {
    if (!selId) { setDeltas(emptyDeltas()); setSchedName(''); setDirty(false); return }
    const found = schedules.find(s => s.id === selId)
    setSchedName(found?.name ?? '')
    supabase.from('construction_method_schedule_rows')
      .select('assembly_class, rules, joint_defaults')
      .eq('schedule_id', selId)
      .then(({ data }) => {
        const d  = emptyDeltas()
        const jd: Record<AssClass, Record<string, string>> = { base: {}, wall: {}, tall: {} }
        for (const row of data ?? []) {
          const cls = row.assembly_class as AssClass
          if (cls === 'base' || cls === 'wall' || cls === 'tall') {
            d[cls]  = row.rules as RuleDelta
            jd[cls] = (row.joint_defaults ?? {}) as Record<string, string>
          }
        }
        setDeltas(d)
        setJointDeltas(jd)
        setDirty(false)
      })
  }, [selId, schedules])

  // ── Mutations ─────────────────────────────────────────────────────────────

  async function createSchedule() {
    const name = newName.trim()
    if (!name) return
    const { data } = await supabase
      .from('construction_method_schedules')
      .insert({ name })
      .select('id,name,is_default')
      .single()
    if (data) {
      await loadSchedules()
      setSelId(data.id)
      setNewName('')
      setCreating(false)
    }
  }

  async function deleteSchedule(id: string) {
    if (!confirm('Delete this construction method schedule?')) return
    await supabase.from('construction_method_schedules').delete().eq('id', id)
    if (selId === id) setSelId(null)
    await loadSchedules()
  }

  async function saveSchedule() {
    if (!selId) return
    setSaving(true)
    try {
      // Rename if changed
      const found = schedules.find(s => s.id === selId)
      if (found && schedName.trim() && schedName.trim() !== found.name) {
        await supabase.from('construction_method_schedules')
          .update({ name: schedName.trim(), updated_at: new Date().toISOString() })
          .eq('id', selId)
      }
      // Upsert all 3 class rows
      const rows: { schedule_id: string; assembly_class: string; rules: RuleDelta; joint_defaults: Record<string, string> }[] = []
      for (const cls of ['base','wall','tall'] as AssClass[]) {
        rows.push({ schedule_id: selId, assembly_class: cls, rules: deltas[cls], joint_defaults: jointDeltas[cls] })
      }
      await supabase.from('construction_method_schedule_rows').upsert(rows, { onConflict: 'schedule_id,assembly_class' })
      setDirty(false)
      await loadSchedules()
    } finally {
      setSaving(false)
    }
  }

  async function setShopDefault(id: string) {
    const { data: shop } = await supabase.from('shop_settings').select('id').limit(1).maybeSingle()
    if (shop?.id) {
      await supabase.from('shop_settings').update({ construction_schedule_id: id }).eq('id', shop.id)
    } else {
      await supabase.from('shop_settings').insert({ construction_schedule_id: id })
    }
    setShopSchedId(id)
    await loadSchedules()
  }

  // ── Rule delta helpers ────────────────────────────────────────────────────

  function setRule(cls: AssClass, key: RuleKey, value: ConstructionRules[RuleKey]) {
    setDeltas(prev => {
      const d = { ...prev[cls] }
      if (value === DEFAULT_RULES[key]) {
        delete (d as Record<string, unknown>)[key]
      } else {
        (d as Record<string, unknown>)[key] = value
      }
      return { ...prev, [cls]: d }
    })
    setDirty(true)
  }

  function setJointDefault(cls: AssClass, key: string, jointTypeId: string | null) {
    setJointDeltas(prev => {
      const d = { ...prev[cls] }
      if (!jointTypeId) delete d[key]
      else d[key] = jointTypeId
      return { ...prev, [cls]: d }
    })
    setDirty(true)
  }

  function toggleEdgeSide(cls: AssClass, part: EdgingKey, side: 'top'|'bottom'|'left'|'right') {
    setDeltas(prev => {
      const d       = { ...prev[cls] }
      const current = effectiveEdgeSides(d, part)
      const newSides: EdgeSides = current.includes(side)
        ? current.filter(s => s !== side)
        : [...current, side]

      const edging: EdgingDefaults = { ...(d.EDGING ?? {}) }
      if (sidesEqual(newSides, DEFAULT_EDGING[part])) {
        delete edging[part]
      } else {
        edging[part] = newSides
      }
      if (Object.keys(edging).length === 0) {
        delete d.EDGING
      } else {
        d.EDGING = edging
      }
      return { ...prev, [cls]: d }
    })
    setDirty(true)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const sel = schedules.find(s => s.id === selId) ?? null
  const delta = deltas[classTab]
  const overrideCount = Object.keys(delta).filter(k => k !== 'EDGING').length
    + Object.keys(delta.EDGING ?? {}).length

  return (
    <div className={embedded ? "flex-1 flex flex-col overflow-hidden" : "h-screen bg-gray-950 text-white flex flex-col overflow-hidden"}>

      {/* Header */}
      {!embedded && (
      <div className="flex-none border-b border-gray-800 px-6 py-3 flex items-center gap-3">
        <Link href="/settings" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">← Settings</Link>
        <span className="text-gray-700">|</span>
        <Link href="/library/schedules" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Material Schedules</Link>
        <span className="text-gray-700">|</span>
        <Link href="/library/drawer-boxes" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Drawer Box Methods</Link>
        <span className="text-gray-700">|</span>
        <span className="text-sm font-semibold text-white">Construction Methods</span>
      </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: schedule list ─────────────────────────────────────────── */}
        <aside className="w-60 flex-none border-r border-gray-800 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Schedules</span>
            <button onClick={() => setCreating(true)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors">+ New</button>
          </div>

          {creating && (
            <div className="px-3 py-2 border-b border-gray-800 flex gap-2">
              <input
                autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createSchedule(); if (e.key === 'Escape') setCreating(false) }}
                placeholder="Schedule name…"
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <button onClick={createSchedule} className="text-xs text-blue-400 hover:text-blue-300">✓</button>
              <button onClick={() => setCreating(false)} className="text-xs text-gray-500 hover:text-gray-300">✕</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto py-1">
            {schedules.map(s => (
              <div key={s.id}
                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  selId === s.id ? 'bg-blue-600/15 text-blue-300' : 'text-gray-300 hover:bg-gray-800/60'
                }`}
                onClick={() => setSelId(s.id)}
              >
                <span className="flex-1 text-xs truncate">{s.name}</span>
                {shopSchedId === s.id && (
                  <span className="text-[9px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded shrink-0">default</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); deleteSchedule(s.id) }}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all text-xs px-1"
                >✕</button>
              </div>
            ))}
            {schedules.length === 0 && (
              <p className="px-4 py-6 text-xs text-gray-600 text-center">No schedules yet.<br/>Click + New to create one.</p>
            )}
          </div>
        </aside>

        {/* ── Right: editor ───────────────────────────────────────────────── */}
        {!sel ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-600">Select or create a construction method schedule</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Editor header */}
            <div className="flex-none border-b border-gray-800 px-6 py-3 flex items-center gap-4">
              <input
                value={schedName} onChange={e => { setSchedName(e.target.value); setDirty(true) }}
                className="bg-transparent text-sm font-semibold text-white border-b border-transparent hover:border-gray-700 focus:border-blue-500 focus:outline-none px-0 py-0.5 w-64"
              />
              <div className="flex-1" />
              {shopSchedId !== sel.id ? (
                <button onClick={() => setShopDefault(sel.id)}
                  className="text-xs text-gray-400 hover:text-green-400 transition-colors border border-gray-700 hover:border-green-700 rounded px-3 py-1">
                  Set as shop default
                </button>
              ) : (
                <span className="text-xs text-green-400 border border-green-900/50 rounded px-3 py-1">Shop default</span>
              )}
              <button onClick={saveSchedule} disabled={saving || !dirty}
                className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>

            {/* Class tabs */}
            <div className="flex-none border-b border-gray-800 px-6 flex gap-1 pt-1">
              {(['base','wall','tall'] as AssClass[]).map(cls => {
                const cnt = Object.keys(deltas[cls]).filter(k => k !== 'EDGING').length
                  + Object.keys(deltas[cls].EDGING ?? {}).length
                return (
                  <button key={cls} onClick={() => setClassTab(cls)}
                    className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                      classTab === cls
                        ? 'border-blue-500 text-blue-300'
                        : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}>
                    {CLASS_LABELS[cls]}
                    {cnt > 0 && (
                      <span className="ml-1.5 text-[10px] bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded-full">{cnt}</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden flex">

              {/* Left: view toggle + content */}
              <div className="flex-1 overflow-hidden flex flex-col">

                {/* View mode toggle */}
                <div className="flex-none border-b border-gray-800 px-6 py-2 flex items-center gap-1">
                  {(['questions','rules'] as const).map(mode => (
                    <button key={mode} onClick={() => setViewMode(mode)}
                      className={`px-3 py-1 text-xs rounded transition-colors ${
                        viewMode === mode ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'
                      }`}>
                      {mode === 'questions' ? 'Questions' : 'All Rules'}
                    </button>
                  ))}
                  {overrideCount > 0 && (
                    <span className="ml-2 text-[10px] text-gray-600">
                      {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {viewMode === 'questions' ? (
                    <QuestionPanel
                      classTab={classTab}
                      delta={delta}
                      onChange={(k, v) => setRule(classTab, k, v)}
                      onHoverParts={setHoverParts}
                    />
                  ) : (
                    <div className="max-w-2xl space-y-6">

                      {/* Rule groups */}
                      {RULE_GROUPS.filter(g => classTab !== 'wall' || g.label !== 'Toe Kick').map(group => (
                        <div key={group.label}>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{group.label}</p>
                          <div className="space-y-px">
                            {group.keys.map(k => (
                              <RuleRow key={k} ruleKey={k} delta={delta}
                                onChange={v => setRule(classTab, k, v as ConstructionRules[RuleKey])} />
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Edging */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Edging Defaults</p>
                        <p className="text-xs text-gray-600 mb-3">
                          Edges that get banded. T = top · B = bottom · L = left · R = right (sheet perspective).
                          Blue = overridden from system default.
                        </p>
                        <div className="space-y-4">
                          {EDGING_GROUPS.map(group => (
                            <div key={group.label}>
                              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-1">{group.label}</p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-600">
                                    <th className="text-left py-1 pr-4 font-normal w-44">Part</th>
                                    {EDGE_SIDES.map(s => (
                                      <th key={s} className="text-center py-1 w-10 font-medium text-gray-500">{EDGE_LABELS[s]}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.keys.map(part => {
                                    const sides    = effectiveEdgeSides(delta, part)
                                    const defSides = DEFAULT_EDGING[part]
                                    const isOver   = !sidesEqual(sides, defSides)
                                    return (
                                      <tr key={part} className={`${isOver ? 'bg-blue-950/20' : 'hover:bg-gray-800/30'} rounded`}>
                                        <td className={`py-1 pr-4 ${isOver ? 'text-blue-300' : 'text-gray-400'}`}>
                                          {EDGING_LABELS[part]}
                                        </td>
                                        {EDGE_SIDES.map(side => {
                                          const checked  = sides.includes(side)
                                          const defCheck = defSides.includes(side)
                                          const changed  = checked !== defCheck
                                          return (
                                            <td key={side} className="py-1 text-center">
                                              <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleEdgeSide(classTab, part, side)}
                                                className={`rounded cursor-pointer ${changed ? 'accent-blue-500' : ''}`}
                                              />
                                            </td>
                                          )
                                        })}
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  )}

                  {/* Joint Defaults — part-by-part edge assignment */}
                  <div className="max-w-2xl mt-6 pt-6 border-t border-gray-800">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Joint Defaults</p>
                    <p className="text-xs text-gray-600 mb-3">
                      Click a part to highlight it in the preview, then set a joint type for each edge that meets
                      another part. An edge shown under two parts is the same joint — set it from either side.
                      Cabinets inherit these and can override per seam in the cabinet edit modal.
                    </p>
                    {jointTypes.length === 0 ? (
                      <p className="text-xs text-gray-600 italic">
                        No joint types in library yet — add them in Library → Joints first.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {carcaseSeamParts(effectiveRule(delta, 'TOP_TYPE') as string).map(part => {
                          const isOpen   = openJointPart === part.partKey
                          const assigned = part.edges.filter(e => jointDeltas[classTab][e.seamKey]).length
                          return (
                            <div key={part.partKey} className="rounded border border-gray-800 overflow-hidden">
                              <button
                                type="button"
                                onClick={() => {
                                  const next = isOpen ? null : part.partKey
                                  setOpenJointPart(next)
                                  setHoverParts(next ? [next] : null)
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                                  isOpen ? 'bg-blue-950/30' : 'hover:bg-gray-800/40'
                                }`}
                              >
                                <span className={`text-[10px] text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                                <span className={`text-xs flex-1 ${isOpen ? 'text-blue-200' : 'text-gray-300'}`}>{part.label}</span>
                                <span className={`text-[10px] ${assigned ? 'text-blue-400' : 'text-gray-600'}`}>
                                  {assigned}/{part.edges.length} edges
                                </span>
                              </button>
                              {isOpen && (
                                <div className="px-3 py-2 space-y-px border-t border-gray-800 bg-gray-900/40">
                                  {part.edges.map(edge => {
                                    const val = jointDeltas[classTab][edge.seamKey] ?? ''
                                    return (
                                      <div key={edge.seamKey} className="flex items-center gap-3 py-1.5">
                                        <span className={`flex-1 text-xs ${val ? 'text-blue-300' : 'text-gray-400'}`}>
                                          {edge.edgeLabel}
                                          <span className="text-gray-600"> → {edge.joinsLabel}</span>
                                        </span>
                                        <select
                                          value={val}
                                          onChange={e => setJointDefault(classTab, edge.seamKey, e.target.value || null)}
                                          className="w-52 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                                        >
                                          <option value="">— No joint —</option>
                                          {jointTypes.map(j => (
                                            <option key={j.id} value={j.id}>{j.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                </div>

              </div>

              {/* 3D Preview panel */}
              <PreviewPanel classTab={classTab} delta={delta} highlightPartKeys={hoverParts} material={previewMats[classTab]} jointDeltas={jointDeltas} jointTypes={jointTypes} jointTypeOps={jointTypeOps}
                onPartSelect={pk => { if (pk) { setOpenJointPart(pk); setHoverParts([pk]) } }} />

            </div>

          </div>
        )}
      </div>
    </div>
  )
}

// ── Preview: 18mm dummy material + resolved-geometry helpers ─────────────────

const PREVIEW_MATERIAL: Material = {
  id: 'preview', name: '18mm Board', DZ: 18,
  sheet_dx: 2400, sheet_dy: 1200, has_grain: false,
}

const C_STROKE = '#4b5563'
const C_INT    = '#0f172a'
const C_DIM    = '#6b7280'
const C_LABEL  = '#9ca3af'
const C_WALL   = '#1e293b'
const C_CUT    = '#475569'

const RC = {
  carcass: { fill: '#374151', stroke: '#4b5563' },
  toekick: { fill: '#451a03', stroke: '#92400e' },
  shelf:   { fill: '#1e1b4b', stroke: '#4338ca' },
}

function isSidePanel(key: string) { return key === 'left_side' || key === 'right_side' }

function elevRect(p: { X: number; Y: number; DX: number; DY: number; DZ: number; part_key?: string }) {
  const isSide = p.part_key ? isSidePanel(p.part_key) : false
  return isSide
    ? { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
    : { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
}
function tkElevRect(p: ResolvedToekickPart) {
  if (p.part_key === 'spreader_horizontal') return { ex: p.X, ey: p.Y + p.DY, ew: p.DX, eh: p.DY }
  return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
}
function shelfElevRect(p: ResolvedInternalPart) { return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ } }

function topRect(p: ResolvedCasePart) {
  if (isSidePanel(p.part_key)) return { tx: p.X, tz: p.Z, tw: p.DZ, td: p.DX }
  if (p.part_key === 'back')   return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DZ }
  return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DX }
}
function tkTopRect(p: ResolvedToekickPart) {
  if (p.part_key === 'spreader_horizontal') return { tx: p.X, tz: p.Z, tw: p.DX, td: p.DZ }
  return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DZ }
}
function shelfTopRect(p: ResolvedInternalPart) { return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DX } }

function sideRect(p: ResolvedCasePart): { sz: number; cy_top: number; sw: number; sh: number } | null {
  if (isSidePanel(p.part_key)) return { sz: p.Z, cy_top: p.Y + p.DY, sw: p.DX, sh: p.DY }
  if (p.part_key === 'back')   return null
  return { sz: p.Z, cy_top: p.Y + p.DZ, sw: p.DX, sh: p.DZ }
}
function tkSideRect(p: ResolvedToekickPart) {
  if (p.part_key === 'spreader_horizontal') return { sz: p.Z, cy_top: p.Y + p.DY, sw: p.DZ, sh: p.DY }
  return { sz: p.Z, cy_top: p.Y + p.DX, sw: p.DZ, sh: p.DX }
}
function shelfSideRect(p: ResolvedInternalPart) { return { sz: p.Z, cy_top: p.Y + p.DZ, sw: p.DX, sh: p.DZ } }

function dimH(x1: number, x2: number, y: number, label: string, above = false) {
  const mid = (x1 + x2) / 2
  const ty = above ? y - 28 : y + 28
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={C_DIM} strokeWidth={1.5} strokeDasharray="5 3" />
      <line x1={x1} y1={y - 8} x2={x1} y2={y + 8} stroke={C_DIM} strokeWidth={1.5} />
      <line x1={x2} y1={y - 8} x2={x2} y2={y + 8} stroke={C_DIM} strokeWidth={1.5} />
      <text x={mid} y={ty} textAnchor="middle" dominantBaseline="central" fontSize={24} fill={C_LABEL} fontFamily="system-ui,sans-serif">{label}</text>
    </g>
  )
}

function dimV(x: number, y1: number, y2: number, label: string, right = false) {
  const mid = (y1 + y2) / 2
  const tx = right ? x + 14 : x - 14
  const anchor = right ? 'start' : 'end'
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={C_DIM} strokeWidth={1.5} strokeDasharray="5 3" />
      <line x1={x - 8} y1={y1} x2={x + 8} y2={y1} stroke={C_DIM} strokeWidth={1.5} />
      <line x1={x - 8} y1={y2} x2={x + 8} y2={y2} stroke={C_DIM} strokeWidth={1.5} />
      <text x={tx} y={mid} textAnchor={anchor} dominantBaseline="central" fontSize={24} fill={C_LABEL} fontFamily="system-ui,sans-serif">{label}</text>
    </g>
  )
}

function viewLabel(cx: number, y: number, text: string) {
  return <text x={cx} y={y} textAnchor="middle" dominantBaseline="central" fontSize={20} fill={C_CUT} fontFamily="system-ui,sans-serif" letterSpacing={1}>{text}</text>
}

type PrevDims = { dx: number; dy: number; dz: number }

function ResolvedElevation({ cab, rp }: { cab: PrevDims; rp: ResolvedCabinet }) {
  const { dx, dy } = cab
  const pl = 80, pt = 50, pr = 40, pb = 40
  const vw = dx + pl + pr
  const vh = dy + pt + pb
  const ox = pl, oy = pt

  function toSVG(ex: number, ey: number, ew: number, eh: number) {
    return { x: ox + ex, y: oy + dy - ey, w: ew, h: eh }
  }

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={ox} y={oy} width={dx} height={dy} fill={C_INT} />
      {rp.toekick_parts.map((p, i) => {
        const { ex, ey, ew, eh } = tkElevRect(p)
        const r = toSVG(ex, ey, ew, eh)
        return <rect key={`tk${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
          fill={RC.toekick.fill} stroke={RC.toekick.stroke} strokeWidth={0.75} />
      })}
      {rp.internal_parts.map((p, i) => {
        const { ex, ey, ew, eh } = shelfElevRect(p)
        const r = toSVG(ex, ey, ew, eh)
        return <rect key={`sh${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
          fill={RC.shelf.fill} stroke={RC.shelf.stroke} strokeWidth={0.5} />
      })}
      {rp.case_parts.map((p, i) => {
        const { ex, ey, ew, eh } = elevRect({ ...p, part_key: p.part_key })
        const r = toSVG(ex, ey, ew, eh)
        return <rect key={`cp${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
          fill={RC.carcass.fill} stroke={RC.carcass.stroke} strokeWidth={0.75} />
      })}
      <rect x={ox} y={oy} width={dx} height={dy} fill="none" stroke="#6b7280" strokeWidth={1.5} />
      <line x1={ox-20} y1={oy+dy} x2={ox+dx+20} y2={oy+dy} stroke="#334155" strokeWidth={2} strokeDasharray="8 4" />
      {dimH(ox, ox+dx, oy-35, `${dx}mm`, true)}
      {dimV(ox-50, oy, oy+dy, `${dy}mm`)}
      {viewLabel(ox+dx/2, vh-14, 'ELEVATION — WIDTH × HEIGHT')}
    </svg>
  )
}

function ResolvedTop({ cab, rp }: { cab: PrevDims; rp: ResolvedCabinet }) {
  const { dx, dz } = cab
  const wallH = 40
  const pl = 80, pt = 50 + wallH, pr = 40, pb = 50
  const vw = dx + pl + pr
  const vh = dz + pt + pb
  const ox = pl, oz = pt

  function toSVG(tx: number, tz: number, tw: number, td: number) {
    return { x: ox + tx, y: oz + tz, w: tw, h: td }
  }

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={ox} y={oz - wallH} width={dx} height={wallH} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} />
      <text x={ox + dx/2} y={oz - wallH/2} textAnchor="middle" dominantBaseline="central"
        fontSize={18} fill="#475569" fontFamily="system-ui,sans-serif" letterSpacing={2}>WALL</text>
      <rect x={ox} y={oz} width={dx} height={dz} fill={C_INT} />
      {rp.internal_parts.map((p, i) => {
        const r = shelfTopRect(p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <rect key={`sh${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={RC.shelf.fill} stroke={RC.shelf.stroke} strokeWidth={0.5} />
      })}
      {rp.case_parts.map((p, i) => {
        const r = topRect(p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <rect key={`cp${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={RC.carcass.fill} stroke={RC.carcass.stroke} strokeWidth={0.75} />
      })}
      {rp.toekick_parts.map((p, i) => {
        const r = tkTopRect(p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <rect key={`tk${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={RC.toekick.fill} stroke={RC.toekick.stroke} strokeWidth={0.75} />
      })}
      <rect x={ox} y={oz} width={dx} height={dz} fill="none" stroke="#6b7280" strokeWidth={1.5} />
      <text x={ox + dx/2} y={oz + dz + 22} textAnchor="middle" dominantBaseline="central"
        fontSize={18} fill="#374151" fontFamily="system-ui,sans-serif">ACCESS</text>
      {dimH(ox, ox + dx, oz + dz + 50, `${dx}mm`)}
      {dimV(ox - 50, oz, oz + dz, `${dz}mm`)}
      {viewLabel(ox + dx/2, vh - 14, 'TOP — WIDTH × DEPTH')}
    </svg>
  )
}

function ResolvedSide({ cab, rp }: { cab: PrevDims; rp: ResolvedCabinet }) {
  const { dz, dy } = cab
  const wallW = 40
  const tkHeight = rp.toekick_parts
    .filter(p => p.part_key !== 'spreader_horizontal')
    .reduce((max, p) => Math.max(max, p.DX), 0)
  const kickZmin = rp.toekick_parts.reduce((min, p) => Math.min(min, p.Z), Infinity)
  const kickZmax = rp.toekick_parts.reduce((max, p) => Math.max(max, p.Z + p.DZ), -Infinity)
  const pl = 80 + wallW, pt = 80, pr = 110, pb = 80
  const vw = dz + pl + pr
  const vh = dy + pt + pb
  const oz = pl, oy = pt

  function toSVG(sz: number, cy_top: number, sw: number, sh: number) {
    return { x: oz + sz, y: oy + dy - cy_top, w: sw, h: sh }
  }

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={oz - wallW} y={oy} width={wallW} height={dy} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} />
      <text x={oz - wallW/2} y={oy + dy/2} textAnchor="middle" dominantBaseline="central"
        fontSize={16} fill="#475569" fontFamily="system-ui,sans-serif"
        transform={`rotate(-90,${oz - wallW/2},${oy + dy/2})`}>WALL</text>
      <rect x={oz} y={oy} width={dz} height={dy} fill={C_INT} />
      {rp.internal_parts.map((p, i) => {
        const r = shelfSideRect(p); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <rect key={`sh${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={RC.shelf.fill} stroke={RC.shelf.stroke} strokeWidth={0.5} />
      })}
      {rp.case_parts.map((p, i) => {
        const r = sideRect(p); if (!r) return null
        const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <rect key={`cp${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={RC.carcass.fill} stroke={RC.carcass.stroke} strokeWidth={0.75} />
      })}
      {rp.toekick_parts.map((p, i) => {
        const r = tkSideRect(p); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <rect key={`tk${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={RC.toekick.fill} stroke={RC.toekick.stroke} strokeWidth={0.75} />
      })}
      <rect x={oz} y={oy} width={dz} height={dy} fill="none" stroke="#6b7280" strokeWidth={1.5} />
      <line x1={oz-20} y1={oy+dy} x2={oz+dz+20} y2={oy+dy} stroke="#334155" strokeWidth={2} strokeDasharray="8 4" />
      {dimH(oz, oz + dz, oy - 50, `${dz}mm`, false)}
      {kickZmin < Infinity && dimH(oz + kickZmin, oz + kickZmax, oy + dy + 30, `${Math.round(kickZmax - kickZmin)}mm`)}
      {dimV(oz + dz + 55, oy, oy + dy, `${dy}mm`, true)}
      {tkHeight > 0 && dimV(oz + dz + 90, oy + dy - tkHeight, oy + dy, `${Math.round(tkHeight)}mm`, true)}
      {viewLabel(oz + dz/2, vh - 14, 'SIDE — DEPTH × HEIGHT')}
    </svg>
  )
}

// ── Preview panel (resizable, tabbed) ─────────────────────────────────────────

type PView = 'front' | 'top' | 'side' | '3d'
const PREVIEW_VIEWS: { id: PView; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'top',   label: 'Top'   },
  { id: 'side',  label: 'Side'  },
  { id: '3d',    label: '3D'    },
]

function PreviewPanel({ classTab, delta, highlightPartKeys, material, jointDeltas, jointTypes, jointTypeOps, onPartSelect }: {
  classTab: AssClass
  delta: Partial<ConstructionRules>
  highlightPartKeys?: string[] | null
  material?: Material
  jointDeltas: Record<AssClass, Record<string, string>>
  jointTypes: { id: string; name: string }[]
  jointTypeOps: Record<string, JointTypeOp[]>
  onPartSelect?: (partKey: string | null) => void
}) {
  const [panelW,       setPanelW]       = useState(380)
  const [activeView,   setActiveView]   = useState<PView>('3d')
  const [wireMode,     setWireMode]     = useState(false)
  const [asmSchedules, setAsmSchedules] = useState<{ id: string; name: string }[]>([])
  const [selectedAsmId, setSelectedAsmId] = useState<string>('')
  const [overrideMat,  setOverrideMat]  = useState<Material | null>(null)
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null)

  // Set initial width to half the available space (sidebar = 240px)
  useEffect(() => {
    setPanelW(Math.round((window.innerWidth - 240) / 2))
  }, [])

  // Load assembly schedule list once
  useEffect(() => {
    supabase.from('assembly_schedules').select('id,name').order('name')
      .then(({ data }) => setAsmSchedules(data ?? []))
  }, [])

  // Reload interior material when schedule selection or class tab changes
  useEffect(() => {
    if (!selectedAsmId) { setOverrideMat(null); return }
    let cancelled = false
    ;(async () => {
      const { data: row } = await supabase
        .from('assembly_schedule_rows')
        .select('material_id')
        .eq('schedule_id', selectedAsmId)
        .eq('assembly_class', classTab)
        .eq('material_role', 'interior')
        .maybeSingle()
      if (cancelled || !row?.material_id) { if (!cancelled) setOverrideMat(null); return }
      const { data: m } = await supabase
        .from('materials').select('id,name,dz,face_colour,back_colour,edge_colour')
        .eq('id', row.material_id).single()
      if (!cancelled && m) {
        setOverrideMat({ id: m.id, name: m.name, DZ: m.dz, sheet_dx: 2400, sheet_dy: 1200, has_grain: false, face_colour: m.face_colour ?? undefined, back_colour: m.back_colour ?? undefined, edge_colour: m.edge_colour ?? undefined })
      }
    })()
    return () => { cancelled = true }
  }, [selectedAsmId, classTab])

  const { dx, dy, dz } = DEFAULT_DIMS[classTab] ?? DEFAULT_DIMS.base
  const isWall = classTab === 'wall'
  const mat = overrideMat ?? material ?? PREVIEW_MATERIAL

  const rules = useMemo(
    () => ({ ...DEFAULT_RULES, ...delta } as ConstructionRules),
    [delta],
  )

  const resolvedCab = useMemo(() => {
    const jointTypeNames = Object.fromEntries(jointTypes.map(j => [j.id, j.name]))
    const input: CabinetInput = {
      id: 'preview',
      assembly_class: classTab,
      DX: dx, DY: dy, DZ: dz,
      has_carcass: true,
      has_internal: true,
      has_face: false,
      has_toekick: !isWall && rules.TOE_TYPE !== 'none',
      top_type: rules.TOP_TYPE,
      toe_type: isWall ? 'none' : rules.TOE_TYPE,
      left_neighbour: 'wall',
      right_neighbour: 'wall',
      exposed_interior: false,
      material:                    mat,
      door_material:               mat,
      shelf_material:              mat,
      toekick_face_material:       mat,
      toekick_interior_material:   mat,
      slide_side_deduction: 13,
      rules,
      joint_defaults:   jointDeltas[classTab],
      joint_type_names: jointTypeNames,
      joint_type_ops:   jointTypeOps,
      face_grid: {
        rows:  [{ row_index: 0, height_locked: false }],
        cols:  [{ col_index: 0, width_locked: false }],
        zones: [{ row_index: 0, col_index: 0, face_type: 'open' }],
      },
      adj_shelves:   [{ sort_order: 0, y_locked: false }, { sort_order: 1, y_locked: false }],
      fixed_shelves: [],
      inner_drawers: [],
      dividers:      [],
    }
    return resolveCabinet(input)
  }, [classTab, dx, dy, dz, isWall, rules, mat, jointDeltas, jointTypes, jointTypeOps])

  const fakeDims: PrevDims = { dx, dy, dz }
  const toeh = rules.TOEH
  const materialColours = useMemo(() => ({
    [mat.id]: { face: mat.face_colour ?? undefined, back: mat.back_colour ?? undefined, edge: mat.edge_colour ?? undefined },
  }), [mat])
  const ebByMatId = useMemo(
    () => ({ [mat.id]: { thickness: 1, color: mat.edge_colour ?? null } }),
    [mat],
  )

  function onResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    resizeRef.current = { startX: e.clientX, startW: panelW }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return
    // dragging handle LEFT makes panel wider
    const diff = resizeRef.current.startX - e.clientX
    setPanelW(Math.max(280, Math.min(760, resizeRef.current.startW + diff)))
  }
  function onResizeUp() { resizeRef.current = null }

  const tabCls = (active: boolean) =>
    `px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${active ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`

  return (
    <div style={{ width: panelW }} className="flex-none border-l border-gray-800 flex flex-col bg-gray-900/40 relative">

      {/* Drag-to-resize handle on left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/60 active:bg-blue-500 transition-colors z-10"
        style={{ touchAction: 'none' }}
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
      />

      {/* Header: label + view tabs + dims */}
      <div className="flex-none pl-3 pr-4 py-2 border-b border-gray-800 flex items-center gap-0.5">
        <span className="text-[9px] text-gray-600 uppercase tracking-wider mr-2 select-none">Preview</span>
        {PREVIEW_VIEWS.map(v => (
          <button key={v.id} onClick={() => setActiveView(v.id)} className={tabCls(activeView === v.id)}>
            {v.label}
          </button>
        ))}
        {activeView === '3d' && (
          <button
            onClick={() => setWireMode(w => !w)}
            title="Toggle wire frame"
            className={tabCls(wireMode)}
          >
            Wire
          </button>
        )}
        <span className="ml-auto text-[9px] text-gray-600 font-mono whitespace-nowrap pl-2">{dx}×{dy}×{dz}</span>
      </div>

      {/* View content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeView === '3d' ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            <Cabinet3DView cab={{ id: 'preview', dx, dy, dz } as CabinetInstance} rp={resolvedCab} highlightPartKeys={highlightPartKeys} materialColours={materialColours} ebByMatId={ebByMatId} wire={wireMode} onPartSelect={onPartSelect} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            {activeView === 'front' && <ResolvedElevation cab={fakeDims} rp={resolvedCab} />}
            {activeView === 'top'   && <ResolvedTop       cab={fakeDims} rp={resolvedCab} />}
            {activeView === 'side'  && <ResolvedSide      cab={fakeDims} rp={resolvedCab} />}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-none px-4 py-2 border-t border-gray-800 space-y-1.5 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="text-gray-600 shrink-0">Schedule</span>
          <select
            value={selectedAsmId}
            onChange={e => setSelectedAsmId(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="">Shop default</option>
            {asmSchedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-4 text-gray-600">
          <span>Top: <span className="text-gray-300 font-mono capitalize">{rules.TOP_TYPE.replace(/_/g, ' ')}</span></span>
          <span>Toe: <span className="text-gray-300 font-mono capitalize">{isWall || rules.TOE_TYPE === 'none' ? 'none' : `${rules.TOE_TYPE} · ${toeh}mm`}</span></span>
          <span className="ml-auto">Board: <span className="text-gray-300 font-mono">{mat.name} ({mat.DZ}mm)</span></span>
        </div>
      </div>
    </div>
  )
}

// ── Guided questions panel ────────────────────────────────────────────────────

function ChipSelect({ options, value, onChange }: {
  options:  { label: string; value: string }[]
  value:    string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            value === opt.value
              ? 'border-blue-500 bg-blue-600/20 text-blue-300'
              : 'border-gray-700 bg-gray-800/60 text-gray-400 hover:border-gray-600 hover:text-gray-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function QCard({ question, isOverride, partKeys, onHover, children }: {
  question:   string
  isOverride: boolean
  partKeys?:  string[]
  onHover?:   (keys: string[] | null) => void
  children:   React.ReactNode
}) {
  return (
    <div
      className={`p-4 rounded-lg border transition-colors ${
        isOverride ? 'border-blue-800/50 bg-blue-950/20' : 'border-gray-800 bg-gray-900/30'
      }`}
      onMouseEnter={() => partKeys && onHover?.(partKeys)}
      onMouseLeave={() => onHover?.(null)}
    >
      <p className={`text-xs font-medium mb-3 ${isOverride ? 'text-blue-300' : 'text-gray-300'}`}>
        {question}
      </p>
      {children}
    </div>
  )
}

function MmInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number" value={value}
        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v) }}
        onFocus={e => e.target.select()}
        className="w-20 text-right bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
      />
      <span className="text-xs text-gray-600">mm</span>
    </div>
  )
}

function QuestionPanel({ classTab, delta, onChange, onHoverParts }: {
  classTab:     AssClass
  delta:        Partial<ConstructionRules>
  onChange:     (key: RuleKey, value: ConstructionRules[RuleKey]) => void
  onHoverParts: (keys: string[] | null) => void
}) {
  const isWall  = classTab === 'wall'
  const toeType = effectiveRule(delta, 'TOE_TYPE')
  const topType = effectiveRule(delta, 'TOP_TYPE')
  const facIns  = effectiveRule(delta, 'FACINS')
  const revL    = effectiveRule(delta, 'REVL')
  const revR    = effectiveRule(delta, 'REVR')
  const revEL   = effectiveRule(delta, 'REVENDL')
  const revER   = effectiveRule(delta, 'REVENDR')

  const asymAdj  = revL !== revR
  const asymWall = revEL !== revER
  const hasRail  = topType === 'front_rail' || topType === 'double_rail'

  return (
    <div className="max-w-xl space-y-3">

      {/* ── Toe kick ── */}
      {!isWall && (<>
        <QCard question="How is the toe kick constructed?" isOverride={'TOE_TYPE' in delta}
          partKeys={['kick_front_face','kick_sub_front','kick_back','spreader_vertical','spreader_horizontal']}
          onHover={onHoverParts}>
          <ChipSelect
            value={toeType}
            onChange={v => onChange('TOE_TYPE', v as ConstructionRules['TOE_TYPE'])}
            options={[
              { label: 'Ladder frame', value: 'ladder' },
              { label: 'Leg supports', value: 'leg' },
              { label: 'No toe kick',  value: 'none' },
            ]}
          />
        </QCard>

        {toeType !== 'none' && (
          <QCard question="Toe kick height" isOverride={'TOEH' in delta}
            partKeys={['kick_front_face','kick_sub_front','kick_back','spreader_vertical','spreader_horizontal']}
            onHover={onHoverParts}>
            <MmInput value={effectiveRule(delta, 'TOEH')} onChange={v => onChange('TOEH', v as ConstructionRules[RuleKey])} />
          </QCard>
        )}
      </>)}

      {/* ── Cabinet top ── */}
      <QCard question="What closes the top of the cabinet?" isOverride={'TOP_TYPE' in delta}
        partKeys={['full_top','front_rail','back_rail']}
        onHover={onHoverParts}>
        <ChipSelect
          value={topType}
          onChange={v => onChange('TOP_TYPE', v as ConstructionRules['TOP_TYPE'])}
          options={[
            { label: 'Full panel',         value: 'full_top' },
            { label: 'Front rail',         value: 'front_rail' },
            { label: 'Front & back rails', value: 'double_rail' },
            { label: 'Nothing',            value: 'none' },
          ]}
        />
      </QCard>

      {hasRail && (
        <QCard question="Rail depth" isOverride={'RD' in delta}
          partKeys={['front_rail','back_rail']}
          onHover={onHoverParts}>
          <MmInput value={effectiveRule(delta, 'RD')} onChange={v => onChange('RD', v as ConstructionRules[RuleKey])} />
        </QCard>
      )}

      {/* ── Face mounting ── */}
      <QCard question="How are door and drawer faces mounted?" isOverride={'FACINS' in delta}
        partKeys={['door','drawer_face','false_panel']}
        onHover={onHoverParts}>
        <ChipSelect
          value={facIns > 0 ? 'inset' : 'overlay'}
          onChange={v => onChange('FACINS', (v === 'inset' ? (facIns > 0 ? facIns : 20) : 0) as ConstructionRules[RuleKey])}
          options={[
            { label: 'Full overlay', value: 'overlay' },
            { label: 'Inset',        value: 'inset' },
          ]}
        />
        {facIns > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">Inset depth</span>
            <MmInput value={facIns} onChange={v => onChange('FACINS', v as ConstructionRules[RuleKey])} />
          </div>
        )}
      </QCard>

      {/* ── Reveals ── */}
      <QCard question="Reveal between adjacent cabinet faces (per side)" isOverride={'REVL' in delta || 'REVR' in delta}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={asymAdj ? '' : revL}
            placeholder={asymAdj ? 'L≠R' : undefined}
            onChange={e => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v)) {
                onChange('REVL', v as ConstructionRules[RuleKey])
                onChange('REVR', v as ConstructionRules[RuleKey])
              }
            }}
            onFocus={e => e.target.select()}
            className="w-20 text-right bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-gray-600">mm</span>
          {asymAdj && <span className="text-[10px] text-amber-600">L≠R — use All Rules to edit individually</span>}
        </div>
      </QCard>

      <QCard question="Reveal where cabinet meets wall or end panel" isOverride={'REVENDL' in delta || 'REVENDR' in delta}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={asymWall ? '' : revEL}
            placeholder={asymWall ? 'L≠R' : undefined}
            onChange={e => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v)) {
                onChange('REVENDL', v as ConstructionRules[RuleKey])
                onChange('REVENDR', v as ConstructionRules[RuleKey])
              }
            }}
            onFocus={e => e.target.select()}
            className="w-20 text-right bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-gray-600">mm</span>
          {asymWall && <span className="text-[10px] text-amber-600">L≠R — use All Rules to edit individually</span>}
        </div>
      </QCard>

      {/* ── Joinery ── */}
      <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider pt-2">Joinery</p>

      <QCard question="How does the bottom panel connect to the sides?" isOverride={'BOTTOM_JOIN' in delta}
        partKeys={['bottom','left_side','right_side']}
        onHover={onHoverParts}>
        <ChipSelect
          value={effectiveRule(delta, 'BOTTOM_JOIN')}
          onChange={v => onChange('BOTTOM_JOIN', v as ConstructionRules['BOTTOM_JOIN'])}
          options={[
            { label: 'Sides are full height — bottom fits between', value: 'sides_outside' },
            { label: 'Bottom is full width — sides sit on top',     value: 'bottom_outside' },
          ]}
        />
      </QCard>

      <QCard question="How does the bottom panel meet the back panel?" isOverride={'BOTTOM_BACK_JOIN' in delta}
        partKeys={['bottom','back']}
        onHover={onHoverParts}>
        <ChipSelect
          value={effectiveRule(delta, 'BOTTOM_BACK_JOIN')}
          onChange={v => onChange('BOTTOM_BACK_JOIN', v as ConstructionRules['BOTTOM_BACK_JOIN'])}
          options={[
            { label: 'Back sits on bottom — bottom runs full depth behind back', value: 'back_on_bottom' },
            { label: 'Bottom butts into back — bottom stops at back inner face',  value: 'butts_into_back' },
          ]}
        />
      </QCard>

      <QCard question="How does the back panel sit?" isOverride={'BACK_JOIN' in delta}
        partKeys={['back','left_side','right_side']}
        onHover={onHoverParts}>
        <ChipSelect
          value={effectiveRule(delta, 'BACK_JOIN')}
          onChange={v => onChange('BACK_JOIN', v as ConstructionRules['BACK_JOIN'])}
          options={[
            { label: 'Back fits between the sides',         value: 'between_sides' },
            { label: 'Back wraps behind and covers sides',  value: 'behind_sides' },
          ]}
        />
      </QCard>

      <QCard question="How does the top panel connect to the back?" isOverride={'TOP_BACK_JOIN' in delta}
        partKeys={['full_top','front_rail','back_rail','back']}
        onHover={onHoverParts}>
        <ChipSelect
          value={effectiveRule(delta, 'TOP_BACK_JOIN')}
          onChange={v => onChange('TOP_BACK_JOIN', v as ConstructionRules['TOP_BACK_JOIN'])}
          options={[
            { label: 'Top butts into back — starts at back inner face', value: 'butts_into_back' },
            { label: 'Top sits over back — runs full depth past back',   value: 'sits_over_back' },
          ]}
        />
      </QCard>

      <QCard question="How do the top rail or panel connect to the sides?" isOverride={'RAIL_JOIN' in delta}
        partKeys={['full_top','front_rail','back_rail','left_side','right_side']}
        onHover={onHoverParts}>
        <ChipSelect
          value={effectiveRule(delta, 'RAIL_JOIN')}
          onChange={v => onChange('RAIL_JOIN', v as ConstructionRules['RAIL_JOIN'])}
          options={[
            { label: 'Rail fits between the sides',      value: 'between_sides' },
            { label: 'Rail sits on top of the sides',    value: 'on_top_of_sides' },
          ]}
        />
      </QCard>

    </div>
  )
}

// ── Rule row ─────────────────────────────────────────────────────────────────

function RuleRow({ ruleKey, delta, onChange }: {
  ruleKey:  RuleKey
  delta:    Partial<ConstructionRules>
  onChange: (v: ConstructionRules[RuleKey]) => void
}) {
  const value      = effectiveRule(delta, ruleKey)
  const baseline   = DEFAULT_RULES[ruleKey]
  const isOverride = ruleKey in delta
  const label      = RULE_LABELS[ruleKey]

  const rowCls = `flex items-center justify-between py-1.5 px-2 rounded ${isOverride ? 'bg-blue-950/30' : 'hover:bg-gray-800/40'}`
  const txtCls = `text-xs ${isOverride ? 'text-blue-300' : 'text-gray-400'}`
  const inpCls = `bg-gray-800 border rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-blue-500 ${
    isOverride ? 'border-blue-700 text-blue-300' : 'border-gray-700 text-white'
  }`

  if (ruleKey === 'TOE_TYPE') {
    return (
      <div className={rowCls}>
        <span className={txtCls}>{label}</span>
        <div className="flex items-center gap-2">
          {isOverride && <span className="text-gray-600 text-[10px]">default: {String(baseline)}</span>}
          <select value={value as string} onChange={e => onChange(e.target.value as ConstructionRules[RuleKey])} className={inpCls}>
            <option value="ladder">Ladder</option>
            <option value="leg">Leg</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>
    )
  }

  if (ruleKey === 'TOP_TYPE') {
    return (
      <div className={rowCls}>
        <span className={txtCls}>{label}</span>
        <div className="flex items-center gap-2">
          {isOverride && <span className="text-gray-600 text-[10px]">default: {String(baseline)}</span>}
          <select value={value as string} onChange={e => onChange(e.target.value as ConstructionRules[RuleKey])} className={inpCls}>
            <option value="full_top">Full Top</option>
            <option value="front_rail">Front Rail</option>
            <option value="double_rail">Double Rail</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>
    )
  }

  if (ruleKey === 'BOTTOM_JOIN') {
    return (
      <div className={rowCls}>
        <span className={txtCls}>{label}</span>
        <div className="flex items-center gap-2">
          {isOverride && <span className="text-gray-600 text-[10px]">default: {String(baseline)}</span>}
          <select value={value as string} onChange={e => onChange(e.target.value as ConstructionRules[RuleKey])} className={inpCls}>
            <option value="sides_outside">Sides outside</option>
            <option value="bottom_outside">Bottom outside</option>
          </select>
        </div>
      </div>
    )
  }

  if (ruleKey === 'BOTTOM_BACK_JOIN') {
    return (
      <div className={rowCls}>
        <span className={txtCls}>{label}</span>
        <div className="flex items-center gap-2">
          {isOverride && <span className="text-gray-600 text-[10px]">default: {String(baseline)}</span>}
          <select value={value as string} onChange={e => onChange(e.target.value as ConstructionRules[RuleKey])} className={inpCls}>
            <option value="back_on_bottom">Back on bottom</option>
            <option value="butts_into_back">Butts into back</option>
          </select>
        </div>
      </div>
    )
  }

  if (ruleKey === 'TOP_BACK_JOIN') {
    return (
      <div className={rowCls}>
        <span className={txtCls}>{label}</span>
        <div className="flex items-center gap-2">
          {isOverride && <span className="text-gray-600 text-[10px]">default: {String(baseline)}</span>}
          <select value={value as string} onChange={e => onChange(e.target.value as ConstructionRules[RuleKey])} className={inpCls}>
            <option value="butts_into_back">Butts into back</option>
            <option value="sits_over_back">Sits over back</option>
          </select>
        </div>
      </div>
    )
  }

  if (ruleKey === 'BACK_JOIN') {
    return (
      <div className={rowCls}>
        <span className={txtCls}>{label}</span>
        <div className="flex items-center gap-2">
          {isOverride && <span className="text-gray-600 text-[10px]">default: {String(baseline)}</span>}
          <select value={value as string} onChange={e => onChange(e.target.value as ConstructionRules[RuleKey])} className={inpCls}>
            <option value="between_sides">Between sides</option>
            <option value="behind_sides">Behind sides</option>
          </select>
        </div>
      </div>
    )
  }

  if (ruleKey === 'RAIL_JOIN') {
    return (
      <div className={rowCls}>
        <span className={txtCls}>{label}</span>
        <div className="flex items-center gap-2">
          {isOverride && <span className="text-gray-600 text-[10px]">default: {String(baseline)}</span>}
          <select value={value as string} onChange={e => onChange(e.target.value as ConstructionRules[RuleKey])} className={inpCls}>
            <option value="between_sides">Between sides</option>
            <option value="on_top_of_sides">On top of sides</option>
          </select>
        </div>
      </div>
    )
  }

  return (
    <div className={rowCls}>
      <span className={txtCls}>{label}</span>
      <div className="flex items-center gap-2">
        {isOverride && <span className="text-gray-600 text-[10px]">default: {String(baseline)}</span>}
        <input
          type="number" value={value as number}
          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v as ConstructionRules[RuleKey]) }}
          onFocus={e => e.target.select()}
          className={`w-20 text-right ${inpCls}`}
        />
      </div>
    </div>
  )
}
