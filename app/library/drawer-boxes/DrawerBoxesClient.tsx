'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import { DrawerBoxRules, DEFAULT_DB_RULES } from '@/src/lib/resolver/types'
import {
  DbRuleKey, DbEdgingKey,
  DB_RULE_LABELS, DB_RULE_GROUPS,
  DB_BOTTOM_JOIN_OPTIONS, DB_JOINT_TYPE_OPTIONS,
  DB_EDGING_LABELS, DB_EDGING_PARTS, DB_EDGE_SIDES, DB_EDGE_LABELS,
  DEFAULT_DB_EDGING,
  effectiveDbRule, effectiveDbEdgeSides, dbSidesEqual,
} from '@/src/lib/drawerBoxConfig'
import type { DrawerType } from '@/src/lib/resolver/types'
import DrawerBoxPreviewPanel from './DrawerBoxPreviewPanel'
import { ThemeToggle } from '../../ThemeToggle'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Method {
  id:          string
  name:        string
  description: string | null
  is_default:  boolean
  active:      boolean
  rules:       Partial<DrawerBoxRules>
  drawer_type: 'system' | 'five_piece'
}

// ── Rule row component ────────────────────────────────────────────────────────

function RuleRow({
  ruleKey,
  delta,
  onChange,
}: {
  ruleKey:  DbRuleKey
  delta:    Partial<DrawerBoxRules>
  onChange: (v: DrawerBoxRules[DbRuleKey]) => void
}) {
  const value  = effectiveDbRule(delta, ruleKey)
  const isOver = ruleKey in delta
  const label  = DB_RULE_LABELS[ruleKey]

  const selectCls = `w-full bg-surface-2 border rounded px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-accent ${
    isOver ? 'border-accent' : 'border-edge-strong'
  }`
  const inputCls = `w-20 bg-surface-2 border rounded px-2 py-1.5 text-xs text-right text-ink focus:outline-none focus:border-accent ${
    isOver ? 'border-accent text-accent-ink' : 'border-edge-strong'
  }`

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={`flex-1 text-xs ${isOver ? 'text-accent-ink' : 'text-ink-muted'}`}>{label}</span>
      {ruleKey === 'DB_BOTTOM_JOIN' ? (
        <select value={value as string} onChange={e => onChange(e.target.value as DrawerBoxRules['DB_BOTTOM_JOIN'])} className={selectCls}>
          {DB_BOTTOM_JOIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : ruleKey === 'DB_JOINT_TYPE' ? (
        <select value={value as string} onChange={e => onChange(e.target.value as DrawerBoxRules['DB_JOINT_TYPE'])} className={selectCls}>
          {DB_JOINT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <>
          <input
            type="number"
            min={0}
            value={value as number}
            onChange={e => onChange(Number(e.target.value))}
            className={inputCls}
          />
          <span className="text-xs text-ink-subtle w-6">mm</span>
        </>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DrawerBoxesClient({ embedded }: { embedded?: boolean }) {
  const [methods,     setMethods]     = useState<Method[]>([])
  const [selId,       setSelId]       = useState<string | null>(null)
  const [editName,    setEditName]    = useState('')
  const [editDesc,    setEditDesc]    = useState('')
  const [editType,    setEditType]    = useState<DrawerType>('five_piece')
  const [delta,       setDelta]       = useState<Partial<DrawerBoxRules>>({})
  const [dirty,       setDirty]       = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [newName,     setNewName]     = useState('')
  const [creating,    setCreating]    = useState(false)
  const [shopDefault, setShopDefault] = useState<string | null>(null)
  const [prevW,       setPrevW]       = useState(400)
  const [prevH,       setPrevH]       = useState(200)
  const [prevD,       setPrevD]       = useState(450)

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [methodsRes, shopRes] = await Promise.all([
      supabase.from('drawer_box_methods').select('id,name,description,is_default,active,rules,drawer_type').order('name'),
      supabase.from('shop_settings').select('drawer_box_method_id').limit(1).maybeSingle(),
    ])
    setMethods((methodsRes.data ?? []) as Method[])
    setShopDefault(shopRes.data?.drawer_box_method_id ?? null)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selId) { setDelta({}); setEditName(''); setEditDesc(''); setDirty(false); return }
    const m = methods.find(m => m.id === selId)
    if (m) {
      setEditName(m.name)
      setEditDesc(m.description ?? '')
      setEditType(m.drawer_type ?? 'five_piece')
      setDelta(m.rules ?? {})
      setDirty(false)
    }
  }, [selId, methods])

  // ── Mutations ────────────────────────────────────────────────────────────────

  async function create() {
    const name = newName.trim()
    if (!name) return
    const { data, error } = await supabase
      .from('drawer_box_methods')
      .insert({ name, rules: {} })
      .select('id')
      .single()
    if (error) { console.error('create drawer box method:', error); setCreating(false); return }
    if (data) {
      await load()
      setSelId(data.id)
      setNewName('')
      setCreating(false)
    }
  }

  async function deleteMethod(id: string) {
    if (!confirm('Delete this drawer box method?')) return
    await supabase.from('drawer_box_methods').delete().eq('id', id)
    if (selId === id) setSelId(null)
    await load()
  }

  async function save() {
    if (!selId) return
    setSaving(true)
    try {
      await supabase
        .from('drawer_box_methods')
        .update({
          name:        editName.trim() || undefined,
          description: editDesc.trim() || null,
          drawer_type: editType,
          rules:       delta,
          updated_at:  new Date().toISOString(),
        })
        .eq('id', selId)
      setDirty(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function setAsShopDefault(id: string) {
    const { data: shop } = await supabase.from('shop_settings').select('id').limit(1).maybeSingle()
    if (shop?.id) {
      await supabase.from('shop_settings').update({ drawer_box_method_id: id }).eq('id', shop.id)
    } else {
      await supabase.from('shop_settings').insert({ drawer_box_method_id: id })
    }
    setShopDefault(id)
    await load()
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from('drawer_box_methods').update({ active: !active }).eq('id', id)
    await load()
  }

  // ── Delta helpers ────────────────────────────────────────────────────────────

  function setRule(key: DbRuleKey, value: DrawerBoxRules[DbRuleKey]) {
    setDelta(prev => {
      const next = { ...prev }
      if (value === DEFAULT_DB_RULES[key]) {
        delete (next as Record<string, unknown>)[key]
      } else {
        (next as Record<string, unknown>)[key] = value
      }
      return next
    })
    setDirty(true)
  }

  function toggleEdgeSide(part: DbEdgingKey, side: 'top' | 'bottom' | 'left' | 'right') {
    setDelta(prev => {
      const current = effectiveDbEdgeSides(prev, part)
      const newSides = current.includes(side)
        ? current.filter(s => s !== side)
        : [...current, side]
      const edging = { ...(prev.DB_EDGING ?? {}) }
      if (dbSidesEqual(newSides, DEFAULT_DB_EDGING[part])) {
        delete edging[part]
      } else {
        edging[part] = newSides
      }
      const next = { ...prev }
      if (Object.keys(edging).length === 0) {
        delete next.DB_EDGING
      } else {
        next.DB_EDGING = edging
      }
      return next
    })
    setDirty(true)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const sel = methods.find(m => m.id === selId) ?? null
  const overrideCount = Object.keys(delta).filter(k => k !== 'DB_EDGING').length
    + Object.keys(delta.DB_EDGING ?? {}).length

  return (
    <div className={embedded ? 'flex-1 flex flex-col overflow-hidden' : 'h-screen bg-canvas text-ink flex flex-col overflow-hidden'}>

      {/* Header */}
      {!embedded && (
        <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-3">
          <ThemeToggle />
          <Link href="/settings" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">← Settings</Link>
          <span className="text-ink-subtle">|</span>
          <Link href="/library/construction-methods" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">Construction Methods</Link>
          <span className="text-ink-subtle">|</span>
          <span className="text-sm font-semibold text-ink">Drawer Box Methods</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: method list ───────────────────────────────────────────── */}
        <aside className="w-56 flex-none border-r border-edge flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Methods</span>
            <button onClick={() => setCreating(true)} className="text-xs text-accent-ink hover:text-accent-ink transition-colors">+ New</button>
          </div>

          {creating && (
            <div className="px-3 py-2 border-b border-edge flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setCreating(false) }}
                placeholder="Method name…"
                className="flex-1 bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent"
              />
              <button onClick={create} className="text-xs text-accent-ink hover:text-accent-ink">✓</button>
              <button onClick={() => setCreating(false)} className="text-xs text-ink-subtle hover:text-ink-muted">✕</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto py-1">
            {methods.map(m => (
              <div
                key={m.id}
                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  selId === m.id ? 'bg-accent/10 text-accent-ink' : 'text-ink-muted hover:bg-surface-2/60'
                } ${!m.active ? 'opacity-50' : ''}`}
                onClick={() => setSelId(m.id)}
              >
                <span className="flex-1 text-xs truncate">{m.name}</span>
                {shopDefault === m.id && (
                  <span className="text-[9px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded shrink-0">default</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); deleteMethod(m.id) }}
                  className="opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-red-400 transition-all text-xs px-1"
                >✕</button>
              </div>
            ))}
            {methods.length === 0 && (
              <p className="px-4 py-6 text-xs text-ink-subtle text-center">No methods yet.<br/>Click + New to create one.</p>
            )}
          </div>
        </aside>

        {/* ── Main area ───────────────────────────────────────────────────── */}
        {!sel ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-ink-subtle">Select or create a drawer box method</p>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">

            {/* ── Editor ─────────────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Editor header */}
              <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-4">
                <input
                  value={editName}
                  onChange={e => { setEditName(e.target.value); setDirty(true) }}
                  className="bg-transparent text-sm font-semibold text-ink border-b border-transparent hover:border-edge-strong focus:border-accent focus:outline-none px-0 py-0.5 w-64"
                />
                <div className="flex-1" />
                <button
                  onClick={() => toggleActive(sel.id, sel.active)}
                  className={`text-xs border rounded px-3 py-1 transition-colors ${
                    sel.active
                      ? 'text-ink-muted border-edge-strong hover:text-ink'
                      : 'text-yellow-400 border-yellow-900/50 hover:text-yellow-300'
                  }`}
                >
                  {sel.active ? 'Active' : 'Inactive'}
                </button>
                {shopDefault !== sel.id ? (
                  <button
                    onClick={() => setAsShopDefault(sel.id)}
                    className="text-xs text-ink-muted hover:text-green-400 transition-colors border border-edge-strong hover:border-green-700 rounded px-3 py-1"
                  >
                    Set as shop default
                  </button>
                ) : (
                  <span className="text-xs text-green-400 border border-green-900/50 rounded px-3 py-1">Shop default</span>
                )}
                <button
                  onClick={save}
                  disabled={saving || !dirty}
                  className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>

              {/* Description */}
              <div className="flex-none px-6 py-3 border-b border-edge">
                <input
                  value={editDesc}
                  onChange={e => { setEditDesc(e.target.value); setDirty(true) }}
                  placeholder="Description (optional)"
                  className="w-full bg-transparent text-xs text-ink-muted placeholder-ink-subtle focus:outline-none focus:text-ink"
                />
              </div>

              {/* Drawer type */}
              <div className="flex-none px-6 py-3 border-b border-edge">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-ink-subtle w-24 shrink-0">Drawer Type</span>
                  <div className="flex gap-2">
                    {([
                      { value: 'system',     label: 'System',       hint: 'e.g. Blum Legrabox — metal sides, timber back + bottom only' },
                      { value: 'five_piece', label: '5-Piece',       hint: 'All timber sides, front, back, and bottom' },
                    ] as { value: DrawerType; label: string; hint: string }[]).map(opt => (
                      <button
                        key={opt.value}
                        title={opt.hint}
                        onClick={() => { setEditType(opt.value); setDirty(true) }}
                        className={`px-4 py-1.5 text-xs rounded-lg border transition-colors ${
                          editType === opt.value
                            ? 'bg-violet-700 border-violet-500 text-white'
                            : 'bg-surface-2 border-edge-strong text-ink-muted hover:text-ink hover:border-edge-strong'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-ink-subtle">
                    {editType === 'system'
                      ? 'Metal sides supplied by slide — only back & bottom are cut'
                      : 'All 5 panels cut from sheet material'}
                  </span>
                </div>
              </div>

              {/* Box size */}
              <div className="flex-none px-6 py-3 border-b border-edge">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-ink-subtle w-24 shrink-0">Box Size</span>
                  <div className="flex items-center gap-4">
                    {([['DX', prevW, setPrevW], ['DY', prevH, setPrevH], ['DZ', prevD, setPrevD]] as [string, number, (v: number) => void][]).map(([label, val, set]) => (
                      <label key={label} className="flex items-center gap-1.5">
                        <span className="text-xs text-ink-subtle">{label}</span>
                        <input
                          type="number" min={50} max={1200}
                          value={val}
                          onChange={e => set(Number(e.target.value))}
                          className="w-16 bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-right text-ink-muted focus:outline-none focus:border-accent"
                        />
                        <span className="text-xs text-ink-subtle">mm</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Rules editor */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="max-w-lg space-y-5">
                  {DB_RULE_GROUPS.map(group => (
                    <div key={group.label}>
                      <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-1">{group.label}</p>
                      <div className="space-y-px">
                        {group.keys.map(k => (
                          <RuleRow key={k} ruleKey={k} delta={delta} onChange={v => setRule(k, v)} />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Edging */}
                  <div>
                    <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-2">Edging</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-ink-subtle">
                          <th className="text-left py-1 pr-4 font-normal w-36">Part</th>
                          {DB_EDGE_SIDES.map(s => (
                            <th key={s} className="text-center py-1 w-9 font-medium text-ink-subtle">{DB_EDGE_LABELS[s]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DB_EDGING_PARTS.map(part => {
                          const sides    = effectiveDbEdgeSides(delta, part)
                          const defSides = DEFAULT_DB_EDGING[part]
                          const isOver   = !dbSidesEqual(sides, defSides)
                          return (
                            <tr key={part} className={`${isOver ? 'bg-accent/10' : 'hover:bg-surface-2/30'} rounded`}>
                              <td className={`py-1 pr-4 ${isOver ? 'text-accent-ink' : 'text-ink-muted'}`}>
                                {DB_EDGING_LABELS[part]}
                              </td>
                              {DB_EDGE_SIDES.map(side => {
                                const checked  = sides.includes(side)
                                const defCheck = defSides.includes(side)
                                const changed  = checked !== defCheck
                                return (
                                  <td key={side} className="py-1 text-center">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleEdgeSide(part, side)}
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

                  {overrideCount > 0 && (
                    <p className="text-[11px] text-ink-subtle">
                      {overrideCount} override{overrideCount !== 1 ? 's' : ''} from system defaults (highlighted in blue)
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Preview panel (self-contained) ──────────────────────────── */}
            <DrawerBoxPreviewPanel
              delta={delta} drawerType={editType}
              prevW={prevW} prevH={prevH} prevD={prevD}
              onPrevWChange={setPrevW} onPrevHChange={setPrevH} onPrevDChange={setPrevD}
            />

          </div>
        )}
      </div>
    </div>
  )
}
