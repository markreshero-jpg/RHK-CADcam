'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import type { BenchtopBuildMethod, BenchtopPartRole } from '@/src/lib/types'
import BuildMethodWizard from './BuildMethodWizard'
import { ThemeToggle } from '../../ThemeToggle'

// ── Part role config ──────────────────────────────────────────────────────────

const PART_ROLES: { key: BenchtopPartRole; label: string; desc: string }[] = [
  { key: 'worktop_panel',        label: 'Worktop Panel',     desc: 'Main flat surface' },
  { key: 'buildup_rail',         label: 'Build-Up Rail',     desc: 'Perimeter framing strips' },
  { key: 'buildup_cross_member', label: 'Cross Member',      desc: 'Internal support members' },
  { key: 'subtop',               label: 'Substrate',         desc: 'Under-stone substrate' },
  { key: 'drop_front_fascia',    label: 'Drop Front Fascia', desc: 'Exposed front face' },
  { key: 'side_fascia',          label: 'Side Fascia',       desc: 'Exposed end face' },
  { key: 'back_fascia',          label: 'Back Fascia',       desc: 'Exposed back (islands)' },
  { key: 'stone_slab',           label: 'Stone Slab',        desc: 'Full-thickness stone panel' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function BenchtopMethodsClient({ embedded }: { embedded?: boolean }) {
  const [methods,    setMethods]    = useState<BenchtopBuildMethod[]>([])
  const [selId,      setSelId]      = useState<string | null>(null)
  const [newName,    setNewName]    = useState('')
  const [creating,   setCreating]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('benchtop_build_methods')
      .select('*')
      .order('name')
    setMethods((data ?? []) as BenchtopBuildMethod[])
  }, [])

  useEffect(() => { load() }, [load])

  const sel = methods.find(m => m.id === selId) ?? null

  // ── Mutations ─────────────────────────────────────────────────────────────

  async function create() {
    const name = newName.trim()
    if (!name) return
    const { data } = await supabase
      .from('benchtop_build_methods')
      .insert({ name, active_part_roles: ['worktop_panel'] })
      .select('*')
      .single()
    if (data) {
      const m = data as BenchtopBuildMethod
      setMethods(prev => [...prev, m].sort((a, b) => a.name.localeCompare(b.name)))
      setSelId(m.id)
      setNewName('')
      setCreating(false)
    }
  }

  async function del(id: string) {
    if (!confirm('Delete this build method?')) return
    await supabase.from('benchtop_build_methods').delete().eq('id', id)
    if (selId === id) setSelId(null)
    setMethods(prev => prev.filter(m => m.id !== id))
  }

  async function patch(updates: Partial<BenchtopBuildMethod>) {
    if (!selId) return
    setSaving(true)
    const { data } = await supabase
      .from('benchtop_build_methods')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', selId)
      .select('*')
      .single()
    if (data) {
      const updated = data as BenchtopBuildMethod
      setMethods(prev => prev.map(m => m.id === selId ? updated : m))
    }
    setSaving(false)
  }

  function handleWizardUpdate(updated: BenchtopBuildMethod) {
    setMethods(prev => prev.map(m => m.id === updated.id ? updated : m))
  }

  function toggleRole(role: BenchtopPartRole) {
    if (!sel) return
    const roles = sel.active_part_roles.includes(role)
      ? sel.active_part_roles.filter(r => r !== role)
      : [...sel.active_part_roles, role]
    patch({ active_part_roles: roles })
  }

  async function toggleDefault() {
    if (!sel) return
    if (!sel.is_default) {
      // Clear existing default first
      await supabase.from('benchtop_build_methods').update({ is_default: false }).eq('is_default', true)
    }
    patch({ is_default: !sel.is_default })
  }

  // ── CSS helpers ─────────────────────────────────────────────────────────────

  const inp  = 'bg-surface-2 border border-edge-strong rounded px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-accent'
  const sel_ = `${inp} w-full`
  const mm   = `${inp} w-24 text-right font-mono`

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={embedded ? 'flex-1 flex flex-col overflow-hidden' : 'h-screen bg-canvas text-ink flex flex-col overflow-hidden'}>

      {/* Header nav */}
      {!embedded && (
        <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-3 text-sm">
          <ThemeToggle />
          <Link href="/settings" className="text-ink-subtle hover:text-ink-muted transition-colors">← Settings</Link>
          <span className="text-ink-subtle">|</span>
          <Link href="/library/schedules" className="text-ink-subtle hover:text-ink-muted transition-colors">Material Schedules</Link>
          <span className="text-ink-subtle">|</span>
          <Link href="/library/construction-methods" className="text-ink-subtle hover:text-ink-muted transition-colors">Construction Methods</Link>
          <span className="text-ink-subtle">|</span>
          <Link href="/library/drawer-boxes" className="text-ink-subtle hover:text-ink-muted transition-colors">Drawer Box Methods</Link>
          <span className="text-ink-subtle">|</span>
          <span className="font-semibold text-ink">Benchtop Methods</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: method list ──────────────────────────────────────────── */}
        <aside className="w-60 flex-none border-r border-edge flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Build Methods</span>
            <button
              onClick={() => setCreating(true)}
              className="text-xs text-accent-ink hover:text-accent-ink transition-colors"
            >+ New</button>
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
              <button onClick={create}          className="text-xs text-accent-ink hover:text-accent-ink">✓</button>
              <button onClick={() => setCreating(false)} className="text-xs text-ink-subtle hover:text-ink-muted">✕</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto py-1">
            {methods.map(m => (
              <div
                key={m.id}
                onClick={() => setSelId(m.id)}
                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  selId === m.id ? 'bg-accent/10 text-accent-ink' : 'text-ink-muted hover:bg-surface-2/60'
                }`}
              >
                <span className="flex-1 text-xs truncate">{m.name}</span>
                {m.is_default && (
                  <span className="text-[9px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded shrink-0">default</span>
                )}
                {!m.active && (
                  <span className="text-[9px] text-ink-subtle shrink-0">inactive</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); del(m.id) }}
                  className="opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-red-400 transition-all text-xs px-1"
                >✕</button>
              </div>
            ))}
            {methods.length === 0 && (
              <p className="px-4 py-6 text-xs text-ink-subtle text-center">
                No build methods yet.<br />Click + New to create one.
              </p>
            )}
          </div>
        </aside>

        {/* ── Right: editor ──────────────────────────────────────────────── */}
        {!sel ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-ink-subtle">Select or create a build method</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 max-w-2xl">

            {/* Name + status row */}
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <label className="text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block">Name</label>
                <input
                  defaultValue={sel.name}
                  key={sel.id + '_name'}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== sel.name) patch({ name: v }) }}
                  className={`${inp} w-full text-sm font-semibold`}
                />
              </div>
              <div className="flex flex-col gap-1.5 pt-5">
                <button
                  onClick={() => patch({ active: !sel.active })}
                  className={`text-xs px-3 py-1 rounded border transition-colors ${
                    sel.active
                      ? 'border-green-700 text-green-400 hover:bg-green-900/20'
                      : 'border-edge-strong text-ink-subtle hover:border-edge-strong'
                  }`}
                >{sel.active ? 'Active' : 'Inactive'}</button>
                <button
                  onClick={toggleDefault}
                  className={`text-xs px-3 py-1 rounded border transition-colors ${
                    sel.is_default
                      ? 'border-blue-800 bg-accent/10 text-accent-ink'
                      : 'border-edge-strong text-ink-subtle hover:border-blue-700 hover:text-accent-ink'
                  }`}
                >{sel.is_default ? 'Shop default' : 'Set default'}</button>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block">Description</label>
              <input
                defaultValue={sel.description ?? ''}
                key={sel.id + '_desc'}
                onBlur={e => { const v = e.target.value.trim() || null; if (v !== sel.description) patch({ description: v }) }}
                placeholder="Optional description…"
                className={`${inp} w-full`}
              />
            </div>

            <hr className="border-edge" />

            {/* Active part roles */}
            <div>
              <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wide mb-3">
                Active Part Roles
              </p>
              <p className="text-[10px] text-ink-subtle mb-3">
                Which parts does this method generate? The resolver only creates parts for active roles.
              </p>
              <div className="space-y-1.5">
                {PART_ROLES.map(role => {
                  const active = sel.active_part_roles.includes(role.key)
                  return (
                    <label
                      key={role.key}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                        active
                          ? 'border-blue-800/50 bg-accent/10'
                          : 'border-edge hover:border-edge-strong'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleRole(role.key)}
                        className="accent-blue-500"
                      />
                      <div className="flex-1">
                        <p className={`text-xs font-medium ${active ? 'text-accent-ink' : 'text-ink-muted'}`}>{role.label}</p>
                        <p className="text-[10px] text-ink-subtle">{role.desc}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            <hr className="border-edge" />

            {/* Dimension settings */}
            <div>
              <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wide mb-3">
                Dimensions
              </p>
              <div className="space-y-3">
                {sel.active_part_roles.includes('buildup_rail') && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-ink-muted">Build-up rail depth</p>
                      <p className="text-[10px] text-ink-subtle">Height of perimeter framing rails</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        defaultValue={sel.buildup_rail_depth ?? ''}
                        key={sel.id + '_rail_depth'}
                        onBlur={e => {
                          const v = parseFloat(e.target.value)
                          patch({ buildup_rail_depth: isNaN(v) ? null : v })
                        }}
                        onFocus={e => e.target.select()}
                        placeholder="—"
                        className={mm}
                      />
                      <span className="text-xs text-ink-subtle">mm</span>
                    </div>
                  </div>
                )}

                {(sel.active_part_roles.includes('drop_front_fascia') ||
                  sel.active_part_roles.includes('side_fascia') ||
                  sel.active_part_roles.includes('back_fascia')) && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-ink-muted">Drop front / fascia height</p>
                      <p className="text-[10px] text-ink-subtle">Height of vertical fascia parts (set 0 for none)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        defaultValue={sel.drop_front_height ?? ''}
                        key={sel.id + '_drop_height'}
                        onBlur={e => {
                          const v = parseFloat(e.target.value)
                          patch({ drop_front_height: isNaN(v) ? null : v })
                        }}
                        onFocus={e => e.target.select()}
                        placeholder="—"
                        className={mm}
                      />
                      <span className="text-xs text-ink-subtle">mm</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <hr className="border-edge" />

            {/* Join / grain settings */}
            <div>
              <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wide mb-3">
                Defaults
              </p>
              <div className="space-y-3">

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-ink-muted">Default join type between runs</p>
                    <p className="text-[10px] text-ink-subtle">Overridable per join in the CAD tool</p>
                  </div>
                  <select
                    value={sel.default_join_type}
                    onChange={e => patch({ default_join_type: e.target.value as 'butt' | 'mitre' })}
                    className={`${inp} w-28`}
                  >
                    <option value="butt">Butt</option>
                    <option value="mitre">Mitre</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-ink-muted">Grain direction</p>
                    <p className="text-[10px] text-ink-subtle">Default worktop panel grain orientation</p>
                  </div>
                  <select
                    value={sel.grain_direction}
                    onChange={e => patch({ grain_direction: e.target.value as 'length' | 'width' })}
                    className={`${inp} w-36`}
                  >
                    <option value="length">Run with length</option>
                    <option value="width">Run with width</option>
                  </select>
                </div>

                {sel.active_part_roles.includes('buildup_rail') && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-ink-muted">Build-up rail corner join</p>
                      <p className="text-[10px] text-ink-subtle">How rails meet at internal corners</p>
                    </div>
                    <select
                      value={sel.corner_join_type}
                      onChange={e => patch({ corner_join_type: e.target.value as 'butt' | 'mitre' })}
                      className={`${inp} w-28`}
                    >
                      <option value="butt">Butt</option>
                      <option value="mitre">Mitre</option>
                    </select>
                  </div>
                )}

              </div>
            </div>

            {/* Wizard answers summary */}
            {Object.keys(sel.wizard_answers).length > 0 && (
              <>
                <hr className="border-edge" />
                <div>
                  <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wide mb-2">
                    Wizard Answers
                  </p>
                  <div className="space-y-1">
                    {Object.entries(sel.wizard_answers).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-[10px]">
                        <span className="text-ink-subtle font-mono w-40 shrink-0">{k}</span>
                        <span className="text-ink-muted">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Wizard button */}
            <div className="flex items-center gap-3 pt-2 pb-8">
              <button
                onClick={() => setWizardOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-surface-3 border border-edge-strong hover:border-edge-strong text-xs text-ink rounded-lg transition-colors"
              >
                <span className="text-base leading-none">✦</span>
                Open Setup Wizard
              </button>
              {saving && <span className="text-[10px] text-ink-subtle">Saving…</span>}
            </div>

          </div>
        )}
      </div>

      {/* Wizard modal */}
      {wizardOpen && sel && (
        <BuildMethodWizard
          method={sel}
          onUpdate={handleWizardUpdate}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  )
}
