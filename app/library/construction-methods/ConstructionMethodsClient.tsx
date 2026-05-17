'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import { ConstructionRules, DEFAULT_RULES, EdgingDefaults, DEFAULT_EDGING, EdgeSides } from '@/src/lib/resolver/types'
import {
  RuleKey, EdgingKey,
  RULE_LABELS, RULE_GROUPS,
  EDGING_LABELS, EDGING_GROUPS, EDGE_SIDES, EDGE_LABELS,
  effectiveRule, effectiveEdgeSides, sidesEqual, computeDelta,
} from '@/src/lib/constructionRuleConfig'

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

export default function ConstructionMethodsClient() {
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

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadSchedules = useCallback(async () => {
    const [{ data: scheds }, { data: shop }] = await Promise.all([
      supabase.from('construction_method_schedules').select('id,name,is_default').order('name'),
      supabase.from('shop_settings').select('construction_schedule_id').limit(1).maybeSingle(),
    ])
    setSchedules(scheds ?? [])
    setShopSchedId(shop?.construction_schedule_id ?? null)
  }, [])

  useEffect(() => { loadSchedules() }, [loadSchedules])

  useEffect(() => {
    if (!selId) { setDeltas(emptyDeltas()); setSchedName(''); setDirty(false); return }
    const found = schedules.find(s => s.id === selId)
    setSchedName(found?.name ?? '')
    supabase.from('construction_method_schedule_rows')
      .select('assembly_class, rules')
      .eq('schedule_id', selId)
      .then(({ data }) => {
        const d = emptyDeltas()
        for (const row of data ?? []) {
          const cls = row.assembly_class as AssClass
          if (cls === 'base' || cls === 'wall' || cls === 'tall') {
            d[cls] = row.rules as RuleDelta
          }
        }
        setDeltas(d)
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
      const rows: { schedule_id: string; assembly_class: string; rules: RuleDelta }[] = []
      for (const cls of ['base','wall','tall'] as AssClass[]) {
        rows.push({ schedule_id: selId, assembly_class: cls, rules: deltas[cls] })
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
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-none border-b border-gray-800 px-6 py-3 flex items-center gap-3">
        <Link href="/settings" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">← Settings</Link>
        <span className="text-gray-700">|</span>
        <Link href="/library/schedules" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Material Schedules</Link>
        <span className="text-gray-700">|</span>
        <span className="text-sm font-semibold text-white">Construction Methods</span>
      </div>

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
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="max-w-2xl space-y-6">

                {/* Rule groups */}
                {RULE_GROUPS.map(group => (
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
                                    const checked = sides.includes(side)
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
            </div>

          </div>
        )}
      </div>
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
