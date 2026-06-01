'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import { ThemeToggle } from '../../ThemeToggle'
import SlideModelEditor, { type SlideModelRow } from './SlideModelEditor'
import SlideDrillingEditor from './SlideDrillingEditor'

// ─── Types ────────────────────────────────────────────────────────────────────

type FVal = string | boolean

interface FieldConfig {
  key: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'select' | 'colour'
  w: number
  placeholder?: string
  step?: string
  options?: { value: string; label: string }[]
}

interface TabConfig {
  id: string
  label: string
  table: string
  initKey: keyof InitialData
  fields: FieldConfig[]
  defaults: Record<string, unknown>
}

interface InitialData {
  board:    Record<string, unknown>[]
  edgeband: Record<string, unknown>[]
  benchtop: Record<string, unknown>[]
  hinges:   Record<string, unknown>[]
  handles:  Record<string, unknown>[]
  slides:   Record<string, unknown>[]
}

// ─── Tab configs ──────────────────────────────────────────────────────────────

const TABS: TabConfig[] = [
  {
    id: 'board', label: 'Board Stock', table: 'materials', initKey: 'board',
    defaults: { name: '', brand: null, finish: null, dz: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false, face_colour: null, back_colour: null, edge_colour: null, cost_per_sheet: null, active: true },
    fields: [
      { key: 'name',           label: 'Name',     type: 'text',    w: 180 },
      { key: 'brand',          label: 'Brand',    type: 'text',    w: 110, placeholder: 'Laminex' },
      { key: 'finish',         label: 'Finish',   type: 'text',    w: 130, placeholder: 'White Satin' },
      { key: 'dz',             label: 'dz mm',    type: 'number',  w: 60,  step: '0.5' },
      { key: 'sheet_dx',       label: 'L mm',     type: 'number',  w: 65 },
      { key: 'sheet_dy',       label: 'W mm',     type: 'number',  w: 65 },
      { key: 'has_grain',      label: 'Grain',    type: 'boolean', w: 48 },
      { key: 'face_colour',    label: 'Face',     type: 'colour',  w: 90 },
      { key: 'back_colour',    label: 'Back',     type: 'colour',  w: 90 },
      { key: 'edge_colour',    label: 'Edge',     type: 'colour',  w: 90 },
      { key: 'cost_per_sheet', label: '$/sht',    type: 'number',  w: 72,  step: '0.01' },
      { key: 'active',         label: 'Active',   type: 'boolean', w: 48 },
    ],
  },
  {
    id: 'edgeband', label: 'Edge Banding', table: 'edge_banding', initKey: 'edgeband',
    defaults: { name: '', brand: null, color: null, finish: null, thickness: 0.4, width: 22, cost_per_metre: null, active: true },
    fields: [
      { key: 'name',           label: 'Name',     type: 'text',    w: 180 },
      { key: 'brand',          label: 'Brand',    type: 'text',    w: 110 },
      { key: 'color',          label: 'Colour',   type: 'colour',  w: 90  },
      { key: 'finish',         label: 'Finish',   type: 'text',    w: 110 },
      { key: 'thickness',      label: 'Thk mm',   type: 'number',  w: 65,  step: '0.1' },
      { key: 'width',          label: 'W mm',     type: 'number',  w: 60 },
      { key: 'cost_per_metre', label: '$/m',      type: 'number',  w: 72,  step: '0.01' },
      { key: 'active',         label: 'Active',   type: 'boolean', w: 48 },
    ],
  },
  {
    id: 'benchtop', label: 'Benchtops', table: 'benchtop_materials', initKey: 'benchtop',
    defaults: { name: '', brand: null, material_type: 'laminate', finish: null, dz: 33, sheet_dx: 3600, sheet_dy: 600, has_grain: false, grain_direction: null, edge_profile: null, cost_per_metre: null, active: true },
    fields: [
      { key: 'name',            label: 'Name',      type: 'text',    w: 160 },
      { key: 'brand',           label: 'Brand',     type: 'text',    w: 100 },
      { key: 'material_type',   label: 'Type',      type: 'select',  w: 100,
        options: [
          { value: 'laminate',   label: 'Laminate' },
          { value: 'stone',      label: 'Stone' },
          { value: 'solid_wood', label: 'Solid Wood' },
          { value: 'acrylic',    label: 'Acrylic' },
          { value: 'other',      label: 'Other' },
        ],
      },
      { key: 'finish',          label: 'Finish',    type: 'text',    w: 110 },
      { key: 'dz',              label: 'dz mm',     type: 'number',  w: 60 },
      { key: 'sheet_dx',        label: 'L mm',      type: 'number',  w: 65 },
      { key: 'sheet_dy',        label: 'W mm',      type: 'number',  w: 65 },
      { key: 'has_grain',       label: 'Grain',     type: 'boolean', w: 48 },
      { key: 'grain_direction', label: 'Grain dir', type: 'select',  w: 80,
        options: [
          { value: 'length', label: 'Length' },
          { value: 'width',  label: 'Width'  },
        ],
      },
      { key: 'edge_profile',    label: 'Edge',      type: 'text',    w: 100 },
      { key: 'cost_per_metre',  label: '$/m',       type: 'number',  w: 72,  step: '0.01' },
      { key: 'active',          label: 'Active',    type: 'boolean', w: 48 },
    ],
  },
  {
    id: 'hinges', label: 'Hinges', table: 'hardware_hinges', initKey: 'hinges',
    defaults: { name: '', brand: null, cup_diameter: 35, boring_depth: 13, overlay: 'half', opening_angle: 110, soft_close: true, cost_per_unit: null, active: true },
    fields: [
      { key: 'name',          label: 'Name',     type: 'text',    w: 160 },
      { key: 'brand',         label: 'Brand',    type: 'text',    w: 100 },
      { key: 'cup_diameter',  label: 'Cup ⌀',    type: 'number',  w: 64 },
      { key: 'boring_depth',  label: 'Bore dep', type: 'number',  w: 68 },
      { key: 'overlay',       label: 'Overlay',  type: 'select',  w: 82,
        options: [
          { value: 'full',  label: 'Full' },
          { value: 'half',  label: 'Half' },
          { value: 'inset', label: 'Inset' },
        ],
      },
      { key: 'opening_angle', label: 'Angle°',   type: 'number',  w: 60 },
      { key: 'soft_close',    label: 'Soft-C',   type: 'boolean', w: 52 },
      { key: 'cost_per_unit', label: '$/ea',     type: 'number',  w: 65,  step: '0.01' },
      { key: 'active',        label: 'Active',   type: 'boolean', w: 48 },
    ],
  },
  {
    id: 'handles', label: 'Handles', table: 'hardware_handles', initKey: 'handles',
    defaults: { name: '', brand: null, handle_type: 'bar', length: null, bore_centres: null, projection: null, finish: null, cost_per_unit: null, active: true },
    fields: [
      { key: 'name',          label: 'Name',     type: 'text',    w: 160 },
      { key: 'brand',         label: 'Brand',    type: 'text',    w: 100 },
      { key: 'handle_type',   label: 'Type',     type: 'select',  w: 90,
        options: [
          { value: 'bar',      label: 'Bar' },
          { value: 'cup',      label: 'Cup' },
          { value: 'knob',     label: 'Knob' },
          { value: 'recessed', label: 'Recessed' },
          { value: 'other',    label: 'Other' },
        ],
      },
      { key: 'length',        label: 'Length',   type: 'number',  w: 70 },
      { key: 'bore_centres',  label: 'Bore ctr', type: 'number',  w: 72 },
      { key: 'projection',    label: 'Proj mm',  type: 'number',  w: 68 },
      { key: 'finish',        label: 'Finish',   type: 'text',    w: 110 },
      { key: 'cost_per_unit', label: '$/ea',     type: 'number',  w: 65,  step: '0.01' },
      { key: 'active',        label: 'Active',   type: 'boolean', w: 48 },
    ],
  },
  {
    id: 'slides', label: 'Slides', table: 'hardware_slides', initKey: 'slides',
    defaults: { name: '', brand: null, nominal_length: null, box_height: null, runner_thickness: 12, side_deduction: 13, min_runner_depth: null, max_runner_depth: null, soft_close: true, full_extension: true, cost_per_pair: null, colour: null, active: true },
    fields: [
      { key: 'name',             label: 'Name',       type: 'text',    w: 160 },
      { key: 'brand',            label: 'Brand',      type: 'text',    w: 100 },
      { key: 'nominal_length',   label: 'NL mm',      type: 'number',  w: 60  },
      { key: 'box_height',       label: 'Box ht mm',  type: 'number',  w: 72  },
      { key: 'runner_thickness', label: 'Runner thk', type: 'number',  w: 76  },
      { key: 'side_deduction',   label: 'Side ded',   type: 'number',  w: 68  },
      { key: 'min_runner_depth', label: 'Min dep',    type: 'number',  w: 68  },
      { key: 'max_runner_depth', label: 'Max dep',    type: 'number',  w: 68  },
      { key: 'soft_close',       label: 'Soft-C',     type: 'boolean', w: 52  },
      { key: 'full_extension',   label: 'Full ext',   type: 'boolean', w: 60  },
      { key: 'cost_per_pair',    label: '$/pair',     type: 'number',  w: 70,  step: '0.01' },
      { key: 'colour',           label: 'Colour',     type: 'colour',  w: 90  },
      { key: 'active',           label: 'Active',     type: 'boolean', w: 48  },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mkForm(defaults: Record<string, unknown>): Record<string, FVal> {
  const out: Record<string, FVal> = {}
  for (const [k, v] of Object.entries(defaults)) {
    out[k] = typeof v === 'boolean' ? v : v == null ? '' : String(v)
  }
  return out
}

function rowToForm(row: Record<string, unknown>, fields: FieldConfig[]): Record<string, FVal> {
  const out: Record<string, FVal> = {}
  for (const f of fields) {
    const v = row[f.key]
    out[f.key] = f.type === 'boolean' ? Boolean(v) : v == null ? '' : String(v)
  }
  return out
}

function formToPayload(form: Record<string, FVal>, fields: FieldConfig[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = form[f.key]
    if (f.type === 'boolean') {
      out[f.key] = Boolean(v)
    } else if (f.type === 'number') {
      const n = parseFloat(v as string)
      out[f.key] = isNaN(n) ? null : n
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
  if (f.type === 'number') {
    const n = Number(val)
    if (isNaN(n)) return String(val)
    return f.step === '0.01' ? n.toFixed(2) : f.step === '0.1' ? n.toFixed(1) : String(n)
  }
  return String(val)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MaterialsClient({ initialData, embedded }: { initialData?: InitialData; embedded?: boolean }) {
  const [activeTab, setActiveTab] = useState(TABS[0].id)

  const [allRows, setAllRows] = useState<Record<string, Record<string, unknown>[]>>(() =>
    Object.fromEntries(TABS.map(t => [t.id, initialData ? initialData[t.initKey] : []]))
  )

  useEffect(() => {
    if (initialData) return
    let cancelled = false
    async function load() {
      const [boards, bands, benchtops, hinges, handles, slides] = await Promise.all([
        supabase.from('materials').select('*').order('name'),
        supabase.from('edge_banding').select('*').order('name'),
        supabase.from('benchtop_materials').select('*').order('name'),
        supabase.from('hardware_hinges').select('*').order('name'),
        supabase.from('hardware_handles').select('*').order('name'),
        supabase.from('hardware_slides').select('*').order('name'),
      ])
      if (cancelled) return
      setAllRows({
        board:    (boards.data    ?? []) as Record<string, unknown>[],
        edgeband: (bands.data     ?? []) as Record<string, unknown>[],
        benchtop: (benchtops.data ?? []) as Record<string, unknown>[],
        hinges:   (hinges.data    ?? []) as Record<string, unknown>[],
        handles:  (handles.data   ?? []) as Record<string, unknown>[],
        slides:   (slides.data    ?? []) as Record<string, unknown>[],
      })
    }
    load()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [forms, setForms] = useState<Record<string, Record<string, FVal>>>(() =>
    Object.fromEntries(TABS.map(t => [t.id, mkForm(t.defaults)]))
  )

  const [editingIds, setEditingIds] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(TABS.map(t => [t.id, null]))
  )

  const [showInactive, setShowInactive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sortKey, setSortKey] = useState<string>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterName, setFilterName] = useState('')
  const [filterBrand, setFilterBrand] = useState('')

  const tab       = TABS.find(t => t.id === activeTab)!
  const rows      = allRows[activeTab] ?? []
  const form      = forms[activeTab] ?? {}
  const editingId = editingIds[activeTab] ?? null

  const hasBrandField = tab.fields.some(f => f.key === 'brand')

  const visibleRows = rows.filter(r => {
    if (!showInactive && r.active === false) return false
    if (filterName && !String(r.name ?? '').toLowerCase().includes(filterName.toLowerCase())) return false
    if (filterBrand && !String(r.brand ?? '').toLowerCase().includes(filterBrand.toLowerCase())) return false
    return true
  })

  const sortField = tab.fields.find(f => f.key === sortKey)
  const sortedRows = sortKey ? [...visibleRows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    let cmp = 0
    if (sortField?.type === 'number') {
      cmp = (Number(av) || 0) - (Number(bv) || 0)
    } else if (sortField?.type === 'boolean') {
      cmp = (av ? 1 : 0) - (bv ? 1 : 0)
    } else {
      cmp = String(av ?? '').localeCompare(String(bv ?? ''))
    }
    return sortDir === 'asc' ? cmp : -cmp
  }) : visibleRows

  function handleSort(key: string) {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function patchForm(updates: Record<string, FVal>) {
    setForms(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], ...updates } }))
  }

  function handleNew() {
    setForms(prev => ({ ...prev, [activeTab]: mkForm(tab.defaults) }))
    setEditingIds(prev => ({ ...prev, [activeTab]: null }))
  }

  function handleDuplicate() {
    if (!editingId) return
    const copy = { ...form, name: String(form['name'] ?? '') + ' (copy)' }
    setForms(prev => ({ ...prev, [activeTab]: copy }))
    setEditingIds(prev => ({ ...prev, [activeTab]: null }))
  }

  function handleRowClick(row: Record<string, unknown>) {
    setForms(prev => ({ ...prev, [activeTab]: rowToForm(row, tab.fields) }))
    setEditingIds(prev => ({ ...prev, [activeTab]: row.id as string }))
  }

  async function handleSave() {
    if (!String(form['name'] ?? '').trim()) return
    const payload = formToPayload(form, tab.fields)
    setSaving(true)

    if (editingId) {
      const { error } = await supabase.from(tab.table).update(payload).eq('id', editingId)
      if (!error) {
        setAllRows(prev => ({
          ...prev,
          [activeTab]: prev[activeTab].map(r => r.id === editingId ? { ...r, ...payload } : r),
        }))
      } else {
        console.error('update error:', error)
      }
    } else {
      const { data, error } = await supabase.from(tab.table).insert(payload).select().single()
      if (!error && data) {
        const newRow = data as Record<string, unknown>
        setAllRows(prev => ({ ...prev, [activeTab]: [newRow, ...prev[activeTab]] }))
        setEditingIds(prev => ({ ...prev, [activeTab]: newRow.id as string }))
      } else {
        console.error('insert error:', error)
      }
    }
    setSaving(false)
  }

  const cellCls = (f: FieldConfig, i: number, last: number) =>
    `flex-none px-2 ${i < last ? 'border-r' : ''}`

  return (
    <div className={embedded ? "flex-1 flex flex-col overflow-hidden" : "h-screen bg-canvas text-ink flex flex-col overflow-hidden"}>

      {/* Header */}
      {!embedded && (
        <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-3">
          <ThemeToggle />
          <Link href="/" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">
            ← Projects
          </Link>
          <span className="text-ink-subtle">|</span>
          <span className="text-sm font-semibold text-ink">Materials Library</span>
        </div>
      )}

      {/* Tabs + inactive toggle */}
      <div className="flex-none border-b border-edge flex items-end gap-0.5 px-4">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id); setSortKey('name'); setSortDir('asc'); setFilterName(''); setFilterBrand('') }}
            className={`px-4 py-2.5 text-xs font-medium transition-colors ${
              t.id === activeTab
                ? 'text-ink border-b-2 border-accent'
                : 'text-ink-subtle hover:text-ink-muted border-b-2 border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 pb-2.5">
          <span className="text-[10px] text-ink-subtle">Name</span>
          <input
            type="text"
            value={filterName}
            onChange={e => setFilterName(e.target.value)}
            placeholder="filter…"
            className="bg-surface-2 border border-edge-strong text-[10px] text-ink-muted rounded px-1.5 py-0.5 w-24 focus:outline-none focus:border-accent placeholder:text-ink-subtle"
          />
          {hasBrandField && (
            <>
              <span className="text-[10px] text-ink-subtle">Brand</span>
              <input
                type="text"
                value={filterBrand}
                onChange={e => setFilterBrand(e.target.value)}
                placeholder="filter…"
                className="bg-surface-2 border border-edge-strong text-[10px] text-ink-muted rounded px-1.5 py-0.5 w-20 focus:outline-none focus:border-accent placeholder:text-ink-subtle"
              />
            </>
          )}
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

      {/* Tab body */}
      <div className="flex-1 flex flex-col overflow-hidden bg-surface">

        {/* ── Entry / edit form row ── */}
        <div className="flex-none border-b border-edge-strong overflow-x-auto bg-surface/80">
          <div className="flex items-stretch min-w-max">
            {tab.fields.map((f, i) => (
              <div
                key={f.key}
                style={{ width: f.w }}
                className={`flex-none flex flex-col justify-between py-2 px-2 ${
                  i < tab.fields.length - 1 ? 'border-r border-edge-strong' : ''
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
                ) : f.type === 'colour' ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      type="color"
                      value={String(form[f.key] || '#ffffff')}
                      onChange={e => patchForm({ [f.key]: e.target.value })}
                      className="w-6 h-5 rounded cursor-pointer border border-edge-strong bg-transparent p-0 flex-none"
                    />
                    <input
                      type="text"
                      value={String(form[f.key] ?? '')}
                      placeholder="#——"
                      maxLength={7}
                      onChange={e => patchForm({ [f.key]: e.target.value })}
                      className="min-w-0 flex-1 bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink font-mono focus:outline-none focus:border-accent placeholder:text-ink-subtle"
                    />
                    {form[f.key] && (
                      <button
                        onClick={() => patchForm({ [f.key]: '' })}
                        className="text-ink-subtle hover:text-ink-muted text-[10px] flex-none"
                      >✕</button>
                    )}
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
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={String(form[f.key] ?? '')}
                    placeholder={f.placeholder}
                    step={f.step}
                    onChange={e => patchForm({ [f.key]: e.target.value })}
                    onFocus={f.type === 'number' ? e => e.target.select() : undefined}
                    className={`block w-full bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink focus:outline-none focus:border-accent placeholder:text-ink-subtle ${
                      f.type === 'number' ? 'text-right' : ''
                    }`}
                  />
                )}
              </div>
            ))}

            {/* Action buttons */}
            <div className="flex-none flex items-center gap-1.5 px-3 border-l border-edge-strong">
              <button
                onClick={handleSave}
                disabled={saving || !String(form['name'] ?? '').trim()}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-xs rounded transition-colors whitespace-nowrap"
              >
                {saving ? '…' : editingId ? 'Update' : 'Save'}
              </button>
              {editingId && (
                <button
                  onClick={handleDuplicate}
                  className="px-3 py-1.5 bg-surface-3 hover:bg-surface-3 text-ink-muted text-xs rounded transition-colors whitespace-nowrap"
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

        {/* ── 3D-model panel (slides only, when editing) ── */}
        {activeTab === 'slides' && editingId && (() => {
          const r = rows.find(x => x.id === editingId)
          if (!r) return null
          const slideRow: SlideModelRow = {
            id:               String(r.id),
            name:             String(r.name ?? ''),
            colour:           (r.colour as string | null) ?? null,
            runner_thickness: Number(r.runner_thickness ?? 12),
            box_height:       (r.box_height as number | null) ?? null,
            nominal_length:   (r.nominal_length as number | null) ?? null,
            model_url:        (r.model_url as string | null) ?? null,
            model_format:     (r.model_format as 'glb' | 'stl' | 'obj' | null) ?? null,
            model_scale:      Number(r.model_scale ?? 1),
            model_anchor_x:   Number(r.model_anchor_x ?? 0),
            model_anchor_y:   Number(r.model_anchor_y ?? 0),
            model_anchor_z:   Number(r.model_anchor_z ?? 0),
          }
          return (
            <>
              <SlideModelEditor
                key={slideRow.id}
                row={slideRow}
                onSaved={patch => {
                  setAllRows(prev => ({
                    ...prev,
                    slides: prev.slides.map(x => x.id === slideRow.id ? { ...x, ...patch } : x),
                  }))
                }}
              />
              <SlideDrillingEditor key={`drill-${slideRow.id}`} slideId={slideRow.id} />
            </>
          )
        })()}

        {/* ── Portal list ── */}
        <div className="flex-1 overflow-auto">

          {/* Column header */}
          <div className="flex items-center bg-surface-2/60 border-b border-edge-strong sticky top-0 z-10 min-w-max flex-none">
            {tab.fields.map((f, i) => (
              <button
                key={f.key}
                style={{ width: f.w }}
                onClick={() => f.type !== 'boolean' && f.type !== 'colour' && handleSort(f.key)}
                className={`flex-none px-2 py-1.5 text-[9px] text-ink-subtle uppercase tracking-wide ${
                  i < tab.fields.length - 1 ? 'border-r border-edge-strong/50' : ''
                } ${
                  f.type === 'boolean' || f.type === 'colour'
                    ? 'text-center cursor-default'
                    : 'text-left hover:text-ink-muted cursor-pointer'
                } ${
                  f.type === 'number' ? 'text-right' : ''
                } ${
                  f.type !== 'boolean' && f.type !== 'colour' ? 'flex items-center gap-1' : ''
                }`}
              >
                {f.label}
                {sortKey === f.key && f.type !== 'boolean' && f.type !== 'colour' && (
                  <span className="text-accent-ink">{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
            ))}
          </div>

          {/* Records */}
          <div className="min-w-max">
            {sortedRows.length === 0 ? (
              <div className="px-4 py-10">
                <p className="text-xs text-ink-subtle">
                  {rows.length === 0
                    ? 'No records yet — fill in the form above and click Save.'
                    : 'All records inactive. Enable "Show inactive" to see them.'}
                </p>
              </div>
            ) : (
              sortedRows.map(row => (
                <div
                  key={String(row.id)}
                  onClick={() => handleRowClick(row)}
                  className={`flex items-center border-b border-edge/60 cursor-pointer transition-colors hover:bg-surface-2/40 ${
                    editingId === row.id ? 'bg-accent/10 hover:bg-accent/10' : ''
                  } ${row.active === false ? 'opacity-40' : ''}`}
                >
                  {tab.fields.map((f, i) => (
                    <div
                      key={f.key}
                      style={{ width: f.w }}
                      className={`${cellCls(f, i, tab.fields.length - 1)} border-edge/50 py-1.5 text-xs truncate ${
                        f.type === 'number'  ? 'text-right  text-ink-muted tabular-nums' :
                        f.type === 'boolean' ? 'text-center text-accent-ink' :
                        f.type === 'colour'  ? 'flex items-center gap-1.5' :
                        'text-ink-muted'
                      }`}
                    >
                      {f.type === 'colour' ? (
                        <>
                          {row[f.key]
                            ? <span className="w-3.5 h-3.5 rounded-sm flex-none border border-edge-strong" style={{ background: String(row[f.key]) }} />
                            : <span className="w-3.5 h-3.5 rounded-sm flex-none border border-dashed border-edge-strong" />
                          }
                          <span className={`font-mono text-[10px] ${row[f.key] ? 'text-ink-muted' : 'text-ink-subtle'}`}>
                            {row[f.key] ? String(row[f.key]) : '—'}
                          </span>
                        </>
                      ) : fmtCell(row[f.key], f)}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none border-t border-edge px-4 py-1.5 flex items-center justify-between">
          <span className="text-[10px] text-ink-subtle">
            {sortedRows.length} of {rows.length} record{rows.length !== 1 ? 's' : ''}
            {(filterName || filterBrand) && (
              <span className="ml-1">· filtered</span>
            )}
            {!showInactive && rows.some(r => r.active === false) && (
              <span className="ml-1">
                · {rows.filter(r => r.active === false).length} inactive hidden
              </span>
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
