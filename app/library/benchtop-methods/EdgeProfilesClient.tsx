'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/src/lib/supabase'
import type {
  BenchtopEdgeProfile, BenchtopEdgeProfileCategory, BenchtopEdgeProfileGenerates,
} from '@/src/lib/types'
import { confirmDelete } from '@/src/components/ConfirmDeleteModal'
import EdgeProfilePreview from './EdgeProfilePreview'

// ── Config ────────────────────────────────────────────────────────────────────

const CATEGORIES: { key: BenchtopEdgeProfileCategory; label: string }[] = [
  { key: 'stone',    label: 'Stone' },
  { key: 'board',    label: 'Board' },
  { key: 'postform', label: 'Postform / Laminate' },
]

const GENERATES: { key: BenchtopEdgeProfileGenerates; label: string; desc: string }[] = [
  { key: 'none',      label: 'Finish only',  desc: 'Edge finish — no extra parts' },
  { key: 'apron',     label: 'Mitred apron', desc: 'Adds an apron strip down the edge (drop height below)' },
  { key: 'waterfall', label: 'Waterfall',    desc: 'Adds a full-height end panel mitred to the top' },
]

// Profiles + which build methods use each one as their default.
async function fetchProfiles() {
  const [{ data: profs }, { data: methods }] = await Promise.all([
    supabase.from('benchtop_edge_profiles').select('*').order('sort_order').order('name'),
    supabase.from('benchtop_build_methods').select('name, default_edge_profile_id'),
  ])
  const usedBy: Record<string, string[]> = {}
  for (const m of (methods ?? []) as { name: string; default_edge_profile_id: string | null }[]) {
    if (m.default_edge_profile_id) (usedBy[m.default_edge_profile_id] ??= []).push(m.name)
  }
  return { profiles: (profs ?? []) as BenchtopEdgeProfile[], usedBy }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EdgeProfilesClient() {
  const [profiles,   setProfiles]   = useState<BenchtopEdgeProfile[]>([])
  const [selId,      setSelId]      = useState<string | null>(null)
  const [creating,   setCreating]   = useState<BenchtopEdgeProfileCategory | null>(null)
  const [newName,    setNewName]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [usedBy,     setUsedBy]     = useState<Record<string, string[]>>({})  // profile id → method names

  const apply = useCallback((r: Awaited<ReturnType<typeof fetchProfiles>>) => {
    setProfiles(r.profiles)
    setUsedBy(r.usedBy)
  }, [])

  const load = useCallback(async () => apply(await fetchProfiles()), [apply])

  useEffect(() => {
    let live = true
    void fetchProfiles().then(r => { if (live) apply(r) })
    return () => { live = false }
  }, [apply])

  const sel = profiles.find(p => p.id === selId) ?? null

  // ── Mutations ─────────────────────────────────────────────────────────────

  async function create(category: BenchtopEdgeProfileCategory) {
    const name = newName.trim()
    if (!name) return
    const sort_order = Math.max(0, ...profiles.filter(p => p.category === category).map(p => p.sort_order)) + 10
    const { data } = await supabase
      .from('benchtop_edge_profiles')
      .insert({ name, category, sort_order })
      .select('*')
      .single()
    if (data) {
      const p = data as BenchtopEdgeProfile
      setProfiles(prev => [...prev, p])
      setSelId(p.id)
      setNewName('')
      setCreating(null)
    }
  }

  async function del(p: BenchtopEdgeProfile) {
    const users = usedBy[p.id] ?? []
    const message = users.length
      ? `"${p.name}" is the default edge profile for: ${users.join(', ')}. Those methods will fall back to no default. Delete it?`
      : `Delete edge profile "${p.name}"?`
    if (!(await confirmDelete({ title: 'Delete Edge Profile', message }))) return
    await supabase.from('benchtop_edge_profiles').delete().eq('id', p.id)
    if (selId === p.id) setSelId(null)
    setProfiles(prev => prev.filter(x => x.id !== p.id))
    if (users.length) void load()
  }

  async function patch(updates: Partial<BenchtopEdgeProfile>) {
    if (!selId) return
    setSaving(true)
    const { data } = await supabase
      .from('benchtop_edge_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', selId)
      .select('*')
      .single()
    if (data) {
      const updated = data as BenchtopEdgeProfile
      setProfiles(prev => prev.map(p => p.id === selId ? updated : p))
    }
    setSaving(false)
  }

  function numOrNull(v: string): number | null {
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }

  // ── CSS helpers ─────────────────────────────────────────────────────────────

  const inp = 'bg-surface-2 border border-edge-strong rounded px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-accent'
  const mm  = `${inp} w-24 text-right font-mono`
  const lbl = 'text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Left: profile list grouped by category ─────────────────────────── */}
      <aside className="w-64 flex-none border-r border-edge flex flex-col overflow-y-auto">
        {CATEGORIES.map(cat => {
          const list = profiles.filter(p => p.category === cat.key)
          return (
            <div key={cat.key} className="border-b border-edge">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">{cat.label}</span>
                <button
                  onClick={() => { setCreating(cat.key); setNewName('') }}
                  className="text-xs text-accent-ink hover:text-accent-ink transition-colors"
                >+ New</button>
              </div>

              {creating === cat.key && (
                <div className="px-3 pb-2 flex gap-2">
                  <input
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') create(cat.key); if (e.key === 'Escape') setCreating(null) }}
                    placeholder="Profile name…"
                    className="flex-1 min-w-0 bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent"
                  />
                  <button onClick={() => create(cat.key)} className="text-xs text-accent-ink">✓</button>
                  <button onClick={() => setCreating(null)} className="text-xs text-ink-subtle hover:text-ink-muted">✕</button>
                </div>
              )}

              <div className="pb-1">
                {list.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setSelId(p.id)}
                    className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                      selId === p.id ? 'bg-accent/10 text-accent-ink' : 'text-ink-muted hover:bg-surface-2/60'
                    }`}
                  >
                    <EdgeProfilePreview profile={p} className="w-8 h-6 shrink-0" />
                    <span className="flex-1 text-xs truncate">{p.name}</span>
                    {p.generates !== 'none' && (
                      <span className="text-[9px] bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded shrink-0">
                        {p.generates === 'apron' ? 'apron' : 'waterfall'}
                      </span>
                    )}
                    {!p.active && <span className="text-[9px] text-ink-subtle shrink-0">inactive</span>}
                    <button
                      onClick={e => { e.stopPropagation(); del(p) }}
                      className="opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-red-400 transition-all text-xs px-1"
                      title="Delete"
                    >✕</button>
                  </div>
                ))}
                {list.length === 0 && creating !== cat.key && (
                  <p className="px-4 py-2 text-[10px] text-ink-subtle">No profiles.</p>
                )}
              </div>
            </div>
          )
        })}
      </aside>

      {/* ── Right: editor ──────────────────────────────────────────────────── */}
      {!sel ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-ink-subtle">Select or create an edge profile</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 max-w-2xl">

          <div className="flex items-start gap-6">
            <EdgeProfilePreview profile={sel} className="w-40 h-32 shrink-0 text-accent-ink" />
            <div className="flex-1 space-y-3">
              <div>
                <label className={lbl}>Name</label>
                <input
                  defaultValue={sel.name}
                  key={sel.id + '_name'}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== sel.name) patch({ name: v }) }}
                  className={`${inp} w-full text-sm font-semibold`}
                />
              </div>
              <div className="flex gap-3">
                <div>
                  <label className={lbl}>Code</label>
                  <input
                    defaultValue={sel.code ?? ''}
                    key={sel.id + '_code'}
                    onBlur={e => { const v = e.target.value.trim().toUpperCase() || null; if (v !== sel.code) patch({ code: v }) }}
                    placeholder="—"
                    className={`${inp} w-24 font-mono uppercase`}
                  />
                </div>
                <div className="flex-1">
                  <label className={lbl}>Category</label>
                  <select
                    value={sel.category}
                    onChange={e => patch({ category: e.target.value as BenchtopEdgeProfileCategory })}
                    className={`${inp} w-full`}
                  >
                    {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div className="pt-5">
                  <button
                    onClick={() => patch({ active: !sel.active })}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      sel.active
                        ? 'border-green-700 text-green-400 hover:bg-green-900/20'
                        : 'border-edge-strong text-ink-subtle'
                    }`}
                  >{sel.active ? 'Active' : 'Inactive'}</button>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className={lbl}>Description</label>
            <input
              defaultValue={sel.description ?? ''}
              key={sel.id + '_desc'}
              onBlur={e => { const v = e.target.value.trim() || null; if (v !== sel.description) patch({ description: v }) }}
              placeholder="Shown in pickers and on reports…"
              className={`${inp} w-full`}
            />
          </div>

          <hr className="border-edge" />

          {/* Part generation */}
          <div>
            <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wide mb-3">Part Generation</p>
            <div className="space-y-1.5">
              {GENERATES.map(g => (
                <label
                  key={g.key}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                    sel.generates === g.key ? 'border-blue-800/50 bg-accent/10' : 'border-edge hover:border-edge-strong'
                  }`}
                >
                  <input
                    type="radio"
                    name={sel.id + '_gen'}
                    checked={sel.generates === g.key}
                    onChange={() => patch({ generates: g.key })}
                    className="accent-blue-500"
                  />
                  <div className="flex-1">
                    <p className={`text-xs font-medium ${sel.generates === g.key ? 'text-accent-ink' : 'text-ink-muted'}`}>{g.label}</p>
                    <p className="text-[10px] text-ink-subtle">{g.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <hr className="border-edge" />

          {/* Dimensions */}
          <div>
            <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wide mb-3">Dimensions</p>
            <div className="space-y-3">
              {sel.generates === 'apron' && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-ink-muted">Apron drop</p>
                    <p className="text-[10px] text-ink-subtle">Total visible edge height, e.g. 40 for a 40mm look</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      defaultValue={sel.apron_drop_mm ?? ''}
                      key={sel.id + '_drop'}
                      onBlur={e => { const v = numOrNull(e.target.value); if (v !== sel.apron_drop_mm) patch({ apron_drop_mm: v }) }}
                      onFocus={e => e.target.select()}
                      placeholder="—"
                      className={mm}
                    />
                    <span className="text-xs text-ink-subtle">mm</span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-ink-muted">Radius</p>
                  <p className="text-[10px] text-ink-subtle">Arris / bullnose radius — for drawings and notes</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    defaultValue={sel.radius_mm ?? ''}
                    key={sel.id + '_radius'}
                    onBlur={e => { const v = numOrNull(e.target.value); if (v !== sel.radius_mm) patch({ radius_mm: v }) }}
                    onFocus={e => e.target.select()}
                    placeholder="—"
                    className={mm}
                  />
                  <span className="text-xs text-ink-subtle">mm</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-ink-muted">Sort order</p>
                  <p className="text-[10px] text-ink-subtle">Position in pickers within its category</p>
                </div>
                <input
                  type="number"
                  defaultValue={sel.sort_order}
                  key={sel.id + '_sort'}
                  onBlur={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v !== sel.sort_order) patch({ sort_order: v }) }}
                  onFocus={e => e.target.select()}
                  className={mm}
                />
              </div>
            </div>
          </div>

          {(usedBy[sel.id]?.length ?? 0) > 0 && (
            <p className="text-[10px] text-ink-subtle">
              Default profile for: {usedBy[sel.id].join(', ')}
            </p>
          )}
          {saving && <p className="text-[10px] text-ink-subtle">Saving…</p>}
        </div>
      )}
    </div>
  )
}
