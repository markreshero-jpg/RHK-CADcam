'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'

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
    defaults: { name: '', brand: null, material_type: 'laminate', finish: null, dz: 33, edge_profile: null, cost_per_metre: null, active: true },
    fields: [
      { key: 'name',           label: 'Name',     type: 'text',    w: 160 },
      { key: 'brand',          label: 'Brand',    type: 'text',    w: 100 },
      { key: 'material_type',  label: 'Type',     type: 'select',  w: 100,
        options: [
          { value: 'laminate',   label: 'Laminate' },
          { value: 'stone',      label: 'Stone' },
          { value: 'solid_wood', label: 'Solid Wood' },
          { value: 'acrylic',    label: 'Acrylic' },
          { value: 'other',      label: 'Other' },
        ],
      },
      { key: 'finish',         label: 'Finish',   type: 'text',    w: 120 },
      { key: 'dz',             label: 'dz mm',    type: 'number',  w: 60 },
      { key: 'edge_profile',   label: 'Edge',     type: 'text',    w: 110 },
      { key: 'cost_per_metre', label: '$/m',      type: 'number',  w: 72,  step: '0.01' },
      { key: 'active',         label: 'Active',   type: 'boolean', w: 48 },
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
    defaults: { name: '', brand: null, nominal_length: null, box_height: null, runner_thickness: 12, side_deduction: 13, min_runner_depth: null, max_runner_depth: null, soft_close: true, full_extension: true, cost_per_pair: null, active: true },
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

  const tab       = TABS.find(t => t.id === activeTab)!
  const rows      = allRows[activeTab] ?? []
  const form      = forms[activeTab] ?? {}
  const editingId = editingIds[activeTab] ?? null

  const visibleRows = showInactive ? rows : rows.filter(r => r.active !== false)

  function patchForm(updates: Record<string, FVal>) {
    setForms(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], ...updates } }))
  }

  function handleNew() {
    setForms(prev => ({ ...prev, [activeTab]: mkForm(tab.defaults) }))
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
    <div className={embedded ? "flex-1 flex flex-col overflow-hidden" : "h-screen bg-gray-950 text-white flex flex-col overflow-hidden"}>

      {/* Header */}
      {!embedded && (
        <div className="flex-none border-b border-gray-800 px-6 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← Projects
          </Link>
          <span className="text-gray-700">|</span>
          <span className="text-sm font-semibold text-white">Materials Library</span>
        </div>
      )}

      {/* Tabs + inactive toggle */}
      <div className="flex-none border-b border-gray-800 flex items-end gap-0.5 px-4">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors ${
              t.id === activeTab
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[10px] text-gray-500 pb-2.5 cursor-pointer select-none">
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
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">

        {/* ── Entry / edit form row ── */}
        <div className="flex-none border-b border-gray-700 overflow-x-auto bg-gray-900/80">
          <div className="flex items-stretch min-w-max">
            {tab.fields.map((f, i) => (
              <div
                key={f.key}
                style={{ width: f.w }}
                className={`flex-none flex flex-col justify-between py-2 px-2 ${
                  i < tab.fields.length - 1 ? 'border-r border-gray-700' : ''
                }`}
              >
                <span className="text-[9px] text-gray-500 uppercase tracking-wide leading-none mb-1.5">
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
                      className="w-6 h-5 rounded cursor-pointer border border-gray-600 bg-transparent p-0 flex-none"
                    />
                    <input
                      type="text"
                      value={String(form[f.key] ?? '')}
                      placeholder="#——"
                      maxLength={7}
                      onChange={e => patchForm({ [f.key]: e.target.value })}
                      className="min-w-0 flex-1 bg-transparent border-b border-gray-700 px-0.5 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500 placeholder:text-gray-700"
                    />
                    {form[f.key] && (
                      <button
                        onClick={() => patchForm({ [f.key]: '' })}
                        className="text-gray-600 hover:text-gray-400 text-[10px] flex-none"
                      >✕</button>
                    )}
                  </div>
                ) : f.type === 'select' ? (
                  <select
                    value={String(form[f.key] ?? '')}
                    onChange={e => patchForm({ [f.key]: e.target.value })}
                    className="bg-transparent border-b border-gray-700 text-xs text-white focus:outline-none focus:border-blue-500 py-0.5 w-full"
                  >
                    {f.options!.map(o => (
                      <option key={o.value} value={o.value} className="bg-gray-900">{o.label}</option>
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
                    className={`block w-full bg-transparent border-b border-gray-700 px-0.5 py-0.5 text-xs text-white focus:outline-none focus:border-blue-500 placeholder:text-gray-700 ${
                      f.type === 'number' ? 'text-right' : ''
                    }`}
                  />
                )}
              </div>
            ))}

            {/* Action buttons */}
            <div className="flex-none flex items-center gap-1.5 px-3 border-l border-gray-700">
              <button
                onClick={handleSave}
                disabled={saving || !String(form['name'] ?? '').trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded transition-colors whitespace-nowrap"
              >
                {saving ? '…' : editingId ? 'Update' : 'Save'}
              </button>
              <button
                onClick={handleNew}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
              >
                New
              </button>
            </div>
          </div>
        </div>

        {/* ── Portal list ── */}
        <div className="flex-1 overflow-auto">

          {/* Column header */}
          <div className="flex items-center bg-gray-800/60 border-b border-gray-700 sticky top-0 z-10 min-w-max">
            {tab.fields.map((f, i) => (
              <div
                key={f.key}
                style={{ width: f.w }}
                className={`${cellCls(f, i, tab.fields.length - 1)} border-gray-700/50 text-[9px] text-gray-500 uppercase tracking-wide py-1.5 ${
                  f.type === 'number'  ? 'text-right'  :
                  f.type === 'boolean' ? 'text-center' : ''
                }`}
              >
                {f.label}
              </div>
            ))}
          </div>

          {/* Records */}
          <div className="min-w-max">
            {visibleRows.length === 0 ? (
              <div className="px-4 py-10">
                <p className="text-xs text-gray-600">
                  {rows.length === 0
                    ? 'No records yet — fill in the form above and click Save.'
                    : 'All records inactive. Enable "Show inactive" to see them.'}
                </p>
              </div>
            ) : (
              visibleRows.map(row => (
                <div
                  key={String(row.id)}
                  onClick={() => handleRowClick(row)}
                  className={`flex items-center border-b border-gray-800/60 cursor-pointer transition-colors hover:bg-gray-800/40 ${
                    editingId === row.id ? 'bg-blue-950/40 hover:bg-blue-950/50' : ''
                  } ${row.active === false ? 'opacity-40' : ''}`}
                >
                  {tab.fields.map((f, i) => (
                    <div
                      key={f.key}
                      style={{ width: f.w }}
                      className={`${cellCls(f, i, tab.fields.length - 1)} border-gray-800/50 py-1.5 text-xs truncate ${
                        f.type === 'number'  ? 'text-right  text-gray-300 tabular-nums' :
                        f.type === 'boolean' ? 'text-center text-blue-400' :
                        f.type === 'colour'  ? 'flex items-center gap-1.5' :
                        'text-gray-300'
                      }`}
                    >
                      {f.type === 'colour' ? (
                        <>
                          {row[f.key]
                            ? <span className="w-3.5 h-3.5 rounded-sm flex-none border border-gray-600" style={{ background: String(row[f.key]) }} />
                            : <span className="w-3.5 h-3.5 rounded-sm flex-none border border-dashed border-gray-700" />
                          }
                          <span className={`font-mono text-[10px] ${row[f.key] ? 'text-gray-300' : 'text-gray-700'}`}>
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
        <div className="flex-none border-t border-gray-800 px-4 py-1.5 flex items-center justify-between">
          <span className="text-[10px] text-gray-600">
            {visibleRows.length} of {rows.length} record{rows.length !== 1 ? 's' : ''}
            {!showInactive && rows.some(r => r.active === false) && (
              <span className="ml-1">
                · {rows.filter(r => r.active === false).length} inactive hidden
              </span>
            )}
          </span>
          {editingId && (
            <span className="text-[10px] text-gray-700 font-mono">{editingId.slice(0, 8)}…</span>
          )}
        </div>

      </div>
    </div>
  )
}
