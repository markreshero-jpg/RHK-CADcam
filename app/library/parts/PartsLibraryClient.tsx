'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import { ThemeToggle } from '../../ThemeToggle'

// ─── Types ────────────────────────────────────────────────────────────────────

type FVal = string | boolean

export interface PartLibraryRow {
  id:             string
  category:       string
  key:            string
  name:           string
  description:    string | null
  material_role:  string
  edge_top:       boolean
  edge_bottom:    boolean
  edge_left:      boolean
  edge_right:     boolean
  optimize_grain: boolean
  cnc:            boolean
  active:         boolean
  // Key is a resolver part identity (case/drawer-box/toekick/internal/face).
  // The optimiser reads `name` live as the shop-wide display name for that
  // type, so the key is locked in the UI; the name is freely editable.
  is_system:      boolean
}

interface FieldConfig {
  key:          string
  label:        string
  type:         'text' | 'number' | 'boolean' | 'select'
  w:            number
  placeholder?: string
  options?:     { value: string; label: string }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'assembly',   label: 'Assembly'   },
  { value: 'drawer_box', label: 'Drawer Box' },
  { value: 'benchtop',   label: 'Benchtop'   },
  { value: 'doors',      label: 'Doors'      },
  { value: 'shelves',    label: 'Shelves'    },
  { value: 'toekick',    label: 'Toekick'    },
  { value: 'slides',     label: 'Slides'     },
  { value: 'hinges',     label: 'Hinges'     },
  { value: 'misc',       label: 'Misc'       },
  { value: 'other',      label: 'Other'      },
]

const MATERIAL_ROLES = [
  { value: 'interior',  label: 'Interior'   },
  { value: 'exposed',   label: 'Exposed'    },
  { value: 'door',      label: 'Door'       },
  { value: 'shelf',     label: 'Shelf'      },
  { value: 'toekick',   label: 'Toekick'    },
  { value: 'drawerbox', label: 'Drawer Box' },
]

const FIELDS: FieldConfig[] = [
  { key: 'name',          label: 'Name',     type: 'text',    w: 160, placeholder: 'Nailer' },
  { key: 'description',   label: 'Desc',     type: 'text',    w: 200, placeholder: 'Horizontal cleat behind back panel' },
  { key: 'key',           label: 'Key',      type: 'text',    w: 90,  placeholder: 'NAILER' },
  { key: 'category',      label: 'Category', type: 'select',  w: 100, options: CATEGORIES },
  { key: 'material_role', label: 'Material', type: 'select',  w: 100, options: MATERIAL_ROLES },
  { key: 'edge_top',      label: 'E-Top',    type: 'boolean', w: 44  },
  { key: 'edge_bottom',   label: 'E-Bot',    type: 'boolean', w: 44  },
  { key: 'edge_left',     label: 'E-Left',   type: 'boolean', w: 48  },
  { key: 'edge_right',    label: 'E-Right',  type: 'boolean', w: 52  },
  { key: 'optimize_grain',label: 'Grain',    type: 'boolean', w: 44  },
  { key: 'cnc',           label: 'CNC',      type: 'boolean', w: 40  },
  { key: 'active',        label: 'Active',   type: 'boolean', w: 48  },
]

const DEFAULTS: Record<string, unknown> = {
  name: '', description: '', key: '', category: 'assembly', material_role: 'interior',
  edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
  optimize_grain: false, cnc: false, active: true,
}

const CAT_TABS = [{ value: 'all', label: 'All' }, ...CATEGORIES]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mkForm(): Record<string, FVal> {
  const out: Record<string, FVal> = {}
  for (const [k, v] of Object.entries(DEFAULTS)) {
    out[k] = typeof v === 'boolean' ? v : v == null ? '' : String(v)
  }
  return out
}

function rowToForm(row: PartLibraryRow): Record<string, FVal> {
  const out: Record<string, FVal> = {}
  for (const f of FIELDS) {
    const v = (row as unknown as Record<string, unknown>)[f.key]
    out[f.key] = f.type === 'boolean' ? Boolean(v) : v == null ? '' : String(v)
  }
  return out
}

function formToPayload(form: Record<string, FVal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of FIELDS) {
    const v = form[f.key]
    if (f.type === 'boolean') {
      out[f.key] = Boolean(v)
    } else {
      const s = (v as string).trim()
      out[f.key] = s || null
    }
  }
  return out
}

function fmtCell(val: unknown, f: FieldConfig): string {
  if (val == null || val === '') return '—'
  if (f.type === 'boolean') return val ? '✓' : ''
  if (f.options) {
    const opt = f.options.find(o => o.value === String(val))
    return opt ? opt.label : String(val)
  }
  return String(val)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PartsLibraryClient({
  initialData,
  embedded,
}: {
  initialData?: PartLibraryRow[]
  embedded?: boolean
}) {
  const [rows, setRows]         = useState<PartLibraryRow[]>(initialData ?? [])
  const [form, setForm]         = useState<Record<string, FVal>>(mkForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [sortKey, setSortKey]   = useState('name')
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    if (initialData) return
    supabase.from('parts_library').select('*').order('name').then(({ data }) => {
      if (data) setRows(data as PartLibraryRow[])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function patchForm(updates: Record<string, FVal>) {
    setForm(prev => ({ ...prev, ...updates }))
  }

  function handleNew() {
    setForm(mkForm())
    setEditingId(null)
  }

  function handleDuplicate() {
    if (!editingId) return
    setForm(prev => ({ ...prev, name: String(prev.name) + ' (copy)', key: String(prev.key) + '_2' }))
    setEditingId(null)
  }

  function handleRowClick(row: PartLibraryRow) {
    setForm(rowToForm(row))
    setEditingId(row.id)
  }

  function handleSort(key: string) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  async function handleSave() {
    if (!String(form.name ?? '').trim()) return
    if (!String(form.key ?? '').trim()) return
    const payload = formToPayload(form)
    setSaving(true)

    if (editingId) {
      const { error } = await supabase.from('parts_library').update(payload).eq('id', editingId)
      if (!error) {
        setRows(prev => prev.map(r => r.id === editingId ? { ...r, ...payload } as PartLibraryRow : r))
      }
    } else {
      const { data, error } = await supabase.from('parts_library').insert(payload).select().single()
      if (!error && data) {
        setRows(prev => [data as PartLibraryRow, ...prev])
        setEditingId((data as PartLibraryRow).id)
      } else if (error) {
        console.error('insert error:', error)
      }
    }
    setSaving(false)
  }

  const catField   = FIELDS.find(f => f.key === 'category')!
  const sortField  = FIELDS.find(f => f.key === sortKey)
  // System rows: key IS the resolver identity the optimiser looks names up by —
  // editing it would silently orphan the lookup, so it's locked.
  const editingSystem = editingId != null && (rows.find(r => r.id === editingId)?.is_system ?? false)

  const filtered = rows.filter(r =>
    (catFilter === 'all' || r.category === catFilter) &&
    (showInactive || r.active)
  )

  const sorted = [...filtered].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[sortKey]
    const bv = (b as unknown as Record<string, unknown>)[sortKey]
    let cmp = 0
    if (sortField?.type === 'boolean') {
      cmp = (av ? 1 : 0) - (bv ? 1 : 0)
    } else {
      cmp = String(av ?? '').localeCompare(String(bv ?? ''))
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div className={embedded ? 'flex-1 flex flex-col overflow-hidden' : 'h-screen bg-canvas text-ink flex flex-col overflow-hidden'}>

      {/* Header */}
      {!embedded && (
        <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-3">
          <ThemeToggle />
          <Link href="/" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">← Projects</Link>
          <span className="text-ink-subtle">|</span>
          <span className="text-sm font-semibold text-ink">Parts Library</span>
        </div>
      )}

      {/* Category tabs + controls */}
      <div className="flex-none border-b border-edge flex items-end gap-0.5 px-4">
        {CAT_TABS.map(ct => (
          <button
            key={ct.value}
            onClick={() => setCatFilter(ct.value)}
            className={`px-3 py-2.5 text-xs font-medium transition-colors ${
              ct.value === catFilter
                ? 'text-ink border-b-2 border-accent'
                : 'text-ink-subtle hover:text-ink-muted border-b-2 border-transparent'
            }`}
          >
            {ct.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 pb-2.5">
          <span className="text-[10px] text-ink-subtle">Sort</span>
          <select
            value={sortKey}
            onChange={e => handleSort(e.target.value)}
            className="bg-surface-2 border border-edge-strong text-[10px] text-ink-muted rounded px-1.5 py-0.5 focus:outline-none focus:border-accent"
          >
            {FIELDS.filter(f => f.type !== 'boolean').map(f => (
              <option key={f.key} value={f.key} className="bg-surface">{f.label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="text-[11px] text-ink-muted hover:text-ink w-5 text-center leading-none"
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        <span className="text-ink-subtle text-xs pb-2.5">|</span>
        <label className="flex items-center gap-1.5 text-[10px] text-ink-subtle pb-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="accent-blue-500"
          />
          Show inactive
        </label>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col overflow-hidden bg-surface">

        {/* Form row */}
        <div className="flex-none border-b border-edge-strong overflow-x-auto bg-surface/80">
          <div className="flex items-stretch min-w-max">
            {FIELDS.map((f, i) => (
              <div
                key={f.key}
                style={{ width: f.w }}
                className={`flex-none flex flex-col justify-between py-2 px-2 ${
                  i < FIELDS.length - 1 ? 'border-r border-edge-strong' : ''
                }`}
              >
                <span className="text-[9px] text-ink-subtle uppercase tracking-wide leading-none mb-1.5">
                  {f.label}
                </span>
                {f.type === 'boolean' ? (
                  <div className="flex items-center justify-center flex-1">
                    <input
                      type="checkbox"
                      checked={(form[f.key] as boolean) ?? false}
                      onChange={e => patchForm({ [f.key]: e.target.checked })}
                      className="accent-blue-500 w-3.5 h-3.5"
                    />
                  </div>
                ) : f.type === 'select' ? (
                  <select
                    value={String(form[f.key] ?? '')}
                    onChange={e => patchForm({ [f.key]: e.target.value })}
                    className="bg-transparent border-b border-edge-strong text-xs text-ink focus:outline-none focus:border-accent py-0.5 w-full"
                  >
                    {f.options!.map(o => (
                      <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={String(form[f.key] ?? '')}
                    placeholder={f.placeholder}
                    disabled={f.key === 'key' && editingSystem}
                    title={f.key === 'key' && editingSystem ? 'System part — the key is its resolver identity and cannot change. Rename via the Name field.' : undefined}
                    onChange={e => patchForm({ [f.key]: e.target.value })}
                    className="block w-full bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink focus:outline-none focus:border-accent placeholder:text-ink-subtle disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                )}
              </div>
            ))}

            {/* Action buttons */}
            <div className="flex-none flex items-center gap-1.5 px-3 border-l border-edge-strong">
              <button
                onClick={handleSave}
                disabled={saving || !String(form.name ?? '').trim() || !String(form.key ?? '').trim()}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-xs rounded transition-colors whitespace-nowrap"
              >
                {saving ? '…' : editingId ? 'Update' : 'Save'}
              </button>
              {editingId && (
                <button
                  onClick={handleDuplicate}
                  className="px-3 py-1.5 bg-surface-3 hover:bg-surface-3 text-ink-muted text-xs rounded transition-colors"
                >
                  Dupe
                </button>
              )}
              <button
                onClick={handleNew}
                className="px-3 py-1.5 bg-surface-3 hover:bg-surface-3 text-ink-muted text-xs rounded transition-colors"
              >
                New
              </button>
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center bg-surface-2/60 border-b border-edge-strong sticky top-0 z-10 min-w-max flex-none">
          {FIELDS.map((f, i) => (
            <button
              key={f.key}
              style={{ width: f.w }}
              onClick={() => f.type !== 'boolean' && handleSort(f.key)}
              className={`flex-none px-2 py-1.5 text-[9px] text-ink-subtle uppercase tracking-wide text-left ${
                i < FIELDS.length - 1 ? 'border-r border-edge-strong/50' : ''
              } ${f.type === 'boolean' ? 'text-center cursor-default' : 'hover:text-ink-muted cursor-pointer'} ${
                f.type === 'boolean' ? '' : 'flex items-center gap-1'
              }`}
            >
              {f.label}
              {sortKey === f.key && f.type !== 'boolean' && (
                <span className="text-accent-ink">{sortDir === 'asc' ? '↑' : '↓'}</span>
              )}
            </button>
          ))}
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-max">
            {sorted.length === 0 ? (
              <div className="px-4 py-10">
                <p className="text-xs text-ink-subtle">
                  {rows.length === 0
                    ? 'No parts yet — fill in the form above and click Save.'
                    : 'No parts in this category. Switch to All or add a new part.'}
                </p>
              </div>
            ) : sorted.map(row => (
              <div
                key={row.id}
                onClick={() => handleRowClick(row)}
                className={`flex items-center border-b border-edge/60 cursor-pointer transition-colors hover:bg-surface-2/40 ${
                  editingId === row.id ? 'bg-accent/10 hover:bg-accent/10' : ''
                } ${!row.active ? 'opacity-40' : ''}`}
              >
                {FIELDS.map((f, i) => {
                  const val = (row as unknown as Record<string, unknown>)[f.key]
                  const isCategory = f.key === 'category'
                  const catLabel = isCategory
                    ? (catField.options!.find(o => o.value === val)?.label ?? String(val))
                    : null
                  return (
                    <div
                      key={f.key}
                      style={{ width: f.w }}
                      className={`flex-none px-2 py-1.5 text-xs truncate ${
                        i < FIELDS.length - 1 ? 'border-r border-edge/50' : ''
                      } ${
                        f.type === 'boolean' ? 'text-center text-accent-ink' : 'text-ink-muted'
                      }`}
                    >
                      {isCategory ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-ink-muted">
                          {catLabel}
                        </span>
                      ) : f.key === 'name' && row.is_system ? (
                        <span title="System part — its name is the shop-wide display name for this generated part type">
                          {fmtCell(val, f)}
                          <span className="ml-1.5 text-[9px] px-1 py-px rounded bg-accent/15 text-accent-ink align-middle">SYS</span>
                        </span>
                      ) : fmtCell(val, f)}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none border-t border-edge px-4 py-1.5 flex items-center justify-between">
          <span className="text-[10px] text-ink-subtle">
            {sorted.length} of {rows.length} part{rows.length !== 1 ? 's' : ''}
            {!showInactive && rows.some(r => !r.active) && (
              <span className="ml-1">· {rows.filter(r => !r.active).length} inactive hidden</span>
            )}
          </span>
          {editingId && (
            <span className="text-[10px] text-ink-subtle font-mono">{editingId.slice(0, 8)}…</span>
          )}
        </div>

      </div>
    </div>
  )
}
