'use client'
import { useState, useEffect } from 'react'
import { Project, ProjectStatus, DEFAULT_DIMS } from '@/src/lib/types'
import { DEFAULT_CONSTRUCTION_METHOD } from '@/src/lib/defaults/constructionMethod'
import { supabase } from '@/src/lib/supabase'

export type JobPropertiesTab = 'details' | 'cabinet_standards' | 'overrides'
type CabinetStandardsTab = 'construction' | 'materials' | 'hardware' | 'doors'

type Rules = typeof DEFAULT_CONSTRUCTION_METHOD.rules
type RuleKey = keyof Rules

const SYS = DEFAULT_CONSTRUCTION_METHOD.rules

const RULE_LABELS: Record<RuleKey, string> = {
  TOEH:    'Toe Height (mm)',
  TOE_TYPE:'Toe Type',
  TOESP:   'Toe Setback Panel (mm)',
  TOESCF:  'Toe Scribe Front (mm)',
  TOESCB:  'Toe Scribe Back (mm)',
  TOESCL:  'Toe Scribe Left (mm)',
  TOESCR:  'Toe Scribe Right (mm)',
  SCRBK:   'Scribe Back (mm)',
  SCRBT:   'Scribe Bottom (mm)',
  SCRL:    'Scribe Left (mm)',
  SCRR:    'Scribe Right (mm)',
  SCRT:    'Scribe Top (mm)',
  TOP_TYPE:'Top Type',
  RD:      'Rail Depth (mm)',
  ADJSB_F: 'Adj. Shelf Front Setback (mm)',
  ADJSB_B: 'Adj. Shelf Back Setback (mm)',
  ADJSL:   'Adj. Shelf Left Notch (mm)',
  ADJSR:   'Adj. Shelf Right Notch (mm)',
  FIXSB_F: 'Fixed Shelf Front Setback (mm)',
  FIXSB_B: 'Fixed Shelf Back Setback (mm)',
  IDCL:          'Inner Drawer Front Clearance Left (mm)',
  IDCR:          'Inner Drawer Front Clearance Right (mm)',
  IDFAO:         'Drawer Box Face Above Opening (mm)',
  SLIDE_SETBACK: 'Min Depth Behind Slide (mm)',
  REVT:    'Face Reveal Top (mm)',
  REVB:    'Face Reveal Bottom (mm)',
  REVL:    'Face Reveal Left (mm)',
  REVR:    'Face Reveal Right (mm)',
  REVENDL: 'End Reveal Left (mm)',
  REVENDR: 'End Reveal Right (mm)',
  GAPC:    'Centre Gap (mm)',
  GAPR:    'Drawer Gap (mm)',
  FACBUF:  'Face Buffer (mm)',
  FACINS:  'Face Inset (mm)',
}

const RULE_GROUPS: { label: string; keys: RuleKey[] }[] = [
  { label: 'Toe Kick',           keys: ['TOEH', 'TOE_TYPE', 'TOESP', 'TOESCF', 'TOESCB', 'TOESCL', 'TOESCR'] },
  { label: 'Case Scribes',       keys: ['SCRBK', 'SCRBT', 'SCRL', 'SCRR', 'SCRT'] },
  { label: 'Top Rail',           keys: ['TOP_TYPE', 'RD'] },
  { label: 'Adjustable Shelves', keys: ['ADJSB_F', 'ADJSB_B', 'ADJSL', 'ADJSR'] },
  { label: 'Fixed Shelves',      keys: ['FIXSB_F', 'FIXSB_B'] },
  { label: 'Inner Drawers',      keys: ['IDCL', 'IDCR', 'IDFAO', 'SLIDE_SETBACK'] },
  { label: 'Face Reveals',       keys: ['REVT', 'REVB', 'REVL', 'REVR', 'REVENDL', 'REVENDR', 'GAPC', 'GAPR'] },
  { label: 'Face Clearance',     keys: ['FACBUF', 'FACINS'] },
]

const STATUS_OPTIONS: ProjectStatus[] = ['draft', 'quoted', 'approved', 'in_production', 'completed', 'archived']

interface ClassDimDefaults {
  base?: { dy?: number; dz?: number }
  wall?: { dy?: number; dz?: number }
  tall?: { dy?: number; dz?: number }
}

type SchedItem = { id: string; name: string; is_default: boolean; kind?: 'external' | 'internal' | null }
type ColourItem = { id: string; schedule_id: string; colour_name: string; colour_code: string | null }

type JobPreset = {
  id: string
  name: string
  construction_schedule_id: string | null
  drawer_box_method_id: string | null
  base_assembly_schedule_id: string | null
  wall_assembly_schedule_id: string | null
  tall_assembly_schedule_id: string | null
  drawerbox_schedule_id: string | null
  inner_drawerbox_schedule_id: string | null
  handle_schedule_id: string | null
  slide_schedule_id: string | null
  hinge_schedule_id: string | null
}

export default function JobPropertiesModal({ project, initialTab, onClose, onSave }: {
  project: Project
  initialTab: JobPropertiesTab
  onClose: () => void
  onSave: (updates: Partial<Project>) => Promise<void>
}) {
  const [tab,   setTab]   = useState<JobPropertiesTab>(initialTab)
  const [csTab, setCsTab] = useState<CabinetStandardsTab>('construction')

  // ── Details ──────────────────────────────────────────────────────────────────
  const [name,          setName]          = useState(project.name)
  const [jobNumber,     setJobNumber]     = useState(project.job_number ?? '')
  const [clientName,    setClientName]    = useState(project.client_name ?? '')
  const [clientAddress, setClientAddress] = useState(project.client_address ?? '')
  const [status,        setStatus]        = useState<ProjectStatus>(project.status)
  const [notes,         setNotes]         = useState(project.notes ?? '')

  // ── Cabinet size defaults ─────────────────────────────────────────────────
  const cd = project.class_dimension_defaults as ClassDimDefaults
  const [baseDy, setBaseDy] = useState(cd.base?.dy ?? DEFAULT_DIMS.base.dy)
  const [baseDz, setBaseDz] = useState(cd.base?.dz ?? DEFAULT_DIMS.base.dz)
  const [wallDy, setWallDy] = useState(cd.wall?.dy ?? DEFAULT_DIMS.wall.dy)
  const [wallDz, setWallDz] = useState(cd.wall?.dz ?? DEFAULT_DIMS.wall.dz)
  const [tallDy, setTallDy] = useState(cd.tall?.dy ?? DEFAULT_DIMS.tall.dy)
  const [tallDz, setTallDz] = useState(cd.tall?.dz ?? DEFAULT_DIMS.tall.dz)

  // ── Construction rules ────────────────────────────────────────────────────
  const [rules, setRules] = useState<Rules>({
    ...SYS,
    ...(project.rule_overrides as Partial<Rules>),
  })
  function setRule<K extends RuleKey>(key: K, value: Rules[K]) {
    setRules(prev => ({ ...prev, [key]: value }))
  }
  const overrideKeys = (Object.keys(SYS) as RuleKey[]).filter(k => rules[k] !== SYS[k])

  // ── Construction method schedules ─────────────────────────────────────────
  const [constructionSched,    setConstructionSched]    = useState(project.construction_schedule_id ?? '')
  const [drawerBoxMethod,      setDrawerBoxMethod]      = useState(project.drawer_box_method_id ?? '')
  const [innerDrawerBoxMethod, setInnerDrawerBoxMethod] = useState(project.inner_drawer_box_method_id ?? '')
  const [constructionScheds,   setConstructionScheds]   = useState<SchedItem[]>([])
  const [drawerBoxMethods,     setDrawerBoxMethods]     = useState<SchedItem[]>([])
  const [doorStyle,            setDoorStyle]            = useState(project.default_door_style_id ?? '')
  const [doorStyles,           setDoorStyles]           = useState<SchedItem[]>([])
  // Per-class door style overrides (blank = inherit the job default style).
  const [baseDoorStyle,        setBaseDoorStyle]        = useState(project.base_door_style_id ?? '')
  const [wallDoorStyle,        setWallDoorStyle]        = useState(project.wall_door_style_id ?? '')
  const [tallDoorStyle,        setTallDoorStyle]        = useState(project.tall_door_style_id ?? '')
  // Per-class door colour overrides + the data to populate their pickers.
  const [baseDoorColour,       setBaseDoorColour]       = useState(project.base_door_colour_id ?? '')
  const [wallDoorColour,       setWallDoorColour]       = useState(project.wall_door_colour_id ?? '')
  const [tallDoorColour,       setTallDoorColour]       = useState(project.tall_door_colour_id ?? '')
  const [styleSchedMap,        setStyleSchedMap]        = useState<Record<string, string | null>>({})
  const [doorColours,          setDoorColours]          = useState<ColourItem[]>([])

  // ── Material schedules (per zone) ─────────────────────────────────────────
  const [baseAsmSched,      setBaseAsmSched]      = useState(project.base_assembly_schedule_id ?? '')
  const [wallAsmSched,      setWallAsmSched]      = useState(project.wall_assembly_schedule_id ?? '')
  const [tallAsmSched,      setTallAsmSched]      = useState(project.tall_assembly_schedule_id ?? '')
  const [drawerBoxSched,    setDrawerBoxSched]    = useState(project.drawerbox_schedule_id ?? '')
  const [innerDbSched,      setInnerDbSched]      = useState(project.inner_drawerbox_schedule_id ?? '')
  const [asmSchedules,        setAsmSchedules]        = useState<SchedItem[]>([])
  const [drawerBoxScheds,     setDrawerBoxScheds]     = useState<SchedItem[]>([])
  const [innerDrawerBoxScheds, setInnerDrawerBoxScheds] = useState<SchedItem[]>([])

  // ── Hardware schedules ────────────────────────────────────────────────────
  const [handleSched, setHandleSched] = useState(project.handle_schedule_id ?? '')
  const [slideSched,  setSlideSched]  = useState(project.slide_schedule_id  ?? '')
  const [hingeSched,  setHingeSched]  = useState(project.hinge_schedule_id  ?? '')
  const [handleScheds, setHandleScheds] = useState<SchedItem[]>([])
  const [slideScheds,  setSlideScheds]  = useState<SchedItem[]>([])
  const [hingeScheds,  setHingeScheds]  = useState<SchedItem[]>([])
  const [schedLoading, setSchedLoading] = useState(false)

  // ── Presets ───────────────────────────────────────────────────────────────
  const [presets,         setPresets]         = useState<JobPreset[]>([])
  const [savingDefaults,  setSavingDefaults]  = useState(false)
  const [savePresetOpen,  setSavePresetOpen]  = useState(false)
  const [newPresetName,   setNewPresetName]   = useState('')

  // ── Load all schedule/method lists on mount ───────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      setSchedLoading(true)
      const [cmsR, dbmR, asmR, hdlR, slR, hiR, dbsR, idbsR, presetsR, dsR, dcR] = await Promise.all([
        supabase.from('construction_method_schedules').select('id,name,is_default').order('name'),
        supabase.from('drawer_box_methods').select('id,name,is_default,kind').eq('active', true).order('name'),
        supabase.from('assembly_schedules').select('id,name,is_default').eq('active', true).order('name'),
        supabase.from('handle_schedules').select('id,name,is_default').eq('active', true).order('name'),
        supabase.from('slide_schedules').select('id,name,is_default').eq('active', true).order('name'),
        supabase.from('hinge_schedules').select('id,name,is_default').eq('active', true).order('name'),
        supabase.from('drawerbox_schedules').select('id,name,is_default').eq('active', true).order('name'),
        supabase.from('inner_drawerbox_schedules').select('id,name,is_default').eq('active', true).order('name'),
        supabase.from('job_presets').select('*').order('name'),
        supabase.from('door_styles').select('id,name,door_material_schedule_id').eq('is_active', true).order('sort_order').order('name'),
        supabase.from('door_schedule_materials').select('id,schedule_id,colour_name,colour_code').eq('is_active', true).order('sort_order').order('colour_name'),
      ])
      if (cancelled) return
      setConstructionScheds(    (cmsR.data  ?? []) as SchedItem[])
      setDrawerBoxMethods(      (dbmR.data  ?? []) as SchedItem[])
      const dsRows = (dsR.data ?? []) as { id: string; name: string; door_material_schedule_id: string | null }[]
      setDoorStyles(            dsRows.map(s => ({ id: s.id, name: s.name, is_default: false })))
      setStyleSchedMap(         Object.fromEntries(dsRows.map(s => [s.id, s.door_material_schedule_id])))
      setDoorColours(           (dcR.data ?? []) as ColourItem[])
      setAsmSchedules(          (asmR.data  ?? []) as SchedItem[])
      setHandleScheds(          (hdlR.data  ?? []) as SchedItem[])
      setSlideScheds(           (slR.data   ?? []) as SchedItem[])
      setHingeScheds(           (hiR.data   ?? []) as SchedItem[])
      setDrawerBoxScheds(       (dbsR.data  ?? []) as SchedItem[])
      setInnerDrawerBoxScheds(  (idbsR.data ?? []) as SchedItem[])
      setPresets(               (presetsR.data ?? []) as JobPreset[])
      setSchedLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const OUTER_TABS: { id: JobPropertiesTab; label: string }[] = [
    { id: 'details',          label: 'Details' },
    { id: 'cabinet_standards', label: 'Cabinet Standards' },
    { id: 'overrides',        label: overrideKeys.length > 0 ? `Overrides (${overrideKeys.length})` : 'Overrides' },
  ]

  const CS_TABS: { id: CabinetStandardsTab; label: string }[] = [
    { id: 'construction', label: 'Construction Methods' },
    { id: 'materials',    label: 'Material Schedules' },
    { id: 'hardware',     label: 'Hardware Schedules' },
    { id: 'doors',        label: 'Doors' },
  ]

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    const newOverrides: Partial<Rules> = {}
    for (const k of Object.keys(SYS) as RuleKey[]) {
      if (rules[k] !== SYS[k]) (newOverrides as Record<string, unknown>)[k] = rules[k]
    }
    await onSave({
      name:          name.trim() || project.name,
      job_number:    jobNumber.trim() || null,
      client_name:   clientName.trim() || null,
      client_address: clientAddress.trim() || null,
      status,
      notes:         notes.trim() || null,
      rule_overrides: newOverrides as Record<string, unknown>,
      class_dimension_defaults: {
        base: { dy: baseDy, dz: baseDz },
        wall: { dy: wallDy, dz: wallDz },
        tall: { dy: tallDy, dz: tallDz },
      },
      construction_schedule_id:     constructionSched     || null,
      drawer_box_method_id:         drawerBoxMethod       || null,
      inner_drawer_box_method_id:   innerDrawerBoxMethod  || null,
      default_door_style_id:        doorStyle             || null,
      base_door_style_id:           baseDoorStyle         || null,
      wall_door_style_id:           wallDoorStyle         || null,
      tall_door_style_id:           tallDoorStyle         || null,
      base_door_colour_id:          baseDoorColour        || null,
      wall_door_colour_id:          wallDoorColour        || null,
      tall_door_colour_id:          tallDoorColour        || null,
      base_assembly_schedule_id:  baseAsmSched   || null,
      wall_assembly_schedule_id:  wallAsmSched   || null,
      tall_assembly_schedule_id:  tallAsmSched   || null,
      drawerbox_schedule_id:      drawerBoxSched || null,
      inner_drawerbox_schedule_id: innerDbSched  || null,
      handle_schedule_id: handleSched || null,
      slide_schedule_id:  slideSched  || null,
      hinge_schedule_id:  hingeSched  || null,
    })
    onClose()
  }

  // ── Save as system defaults (per CS sub-tab) ──────────────────────────────
  async function saveConstructionDefaults() {
    setSavingDefaults(true)
    try {
      // shop_settings stores construction_schedule_id + drawer_box_method_id
      const { data: ss } = await supabase.from('shop_settings').select('id').limit(1).maybeSingle()
      if (ss?.id) {
        await supabase.from('shop_settings').update({
          construction_schedule_id:   constructionSched    || null,
          drawer_box_method_id:       drawerBoxMethod      || null,
          inner_drawer_box_method_id: innerDrawerBoxMethod || null,
        }).eq('id', ss.id)
      }
    } finally {
      setSavingDefaults(false)
    }
  }

  async function saveScheduleDefault(table: string, id: string | null) {
    if (!id) return
    await supabase.from(table).update({ is_default: false }).eq('is_default', true)
    await supabase.from(table).update({ is_default: true }).eq('id', id)
  }

  async function saveMaterialDefaults() {
    setSavingDefaults(true)
    try {
      // Use base assembly schedule as the shop-wide default (resolver uses a single default)
      const effectiveAsm = baseAsmSched || wallAsmSched || tallAsmSched
      await Promise.all([
        saveScheduleDefault('assembly_schedules',        effectiveAsm),
        saveScheduleDefault('drawerbox_schedules',       drawerBoxSched),
        saveScheduleDefault('inner_drawerbox_schedules', innerDbSched),
      ])
    } finally {
      setSavingDefaults(false)
    }
  }

  async function saveHardwareDefaults() {
    setSavingDefaults(true)
    try {
      await Promise.all([
        saveScheduleDefault('handle_schedules', handleSched),
        saveScheduleDefault('slide_schedules',  slideSched),
        saveScheduleDefault('hinge_schedules',  hingeSched),
      ])
    } finally {
      setSavingDefaults(false)
    }
  }

  // ── Preset helpers ────────────────────────────────────────────────────────
  function applyPreset(preset: JobPreset) {
    if (preset.construction_schedule_id)    setConstructionSched(preset.construction_schedule_id)
    if (preset.drawer_box_method_id)        setDrawerBoxMethod(preset.drawer_box_method_id)
    if (preset.base_assembly_schedule_id)   setBaseAsmSched(preset.base_assembly_schedule_id)
    if (preset.wall_assembly_schedule_id)   setWallAsmSched(preset.wall_assembly_schedule_id)
    if (preset.tall_assembly_schedule_id)   setTallAsmSched(preset.tall_assembly_schedule_id)
    if (preset.drawerbox_schedule_id)       setDrawerBoxSched(preset.drawerbox_schedule_id)
    if (preset.inner_drawerbox_schedule_id) setInnerDbSched(preset.inner_drawerbox_schedule_id)
    if (preset.handle_schedule_id)          setHandleSched(preset.handle_schedule_id)
    if (preset.slide_schedule_id)           setSlideSched(preset.slide_schedule_id)
    if (preset.hinge_schedule_id)           setHingeSched(preset.hinge_schedule_id)
  }

  async function savePreset() {
    const trimmed = newPresetName.trim()
    if (!trimmed) return
    const { data } = await supabase.from('job_presets').insert({
      name: trimmed,
      construction_schedule_id:    constructionSched || null,
      drawer_box_method_id:        drawerBoxMethod   || null,
      base_assembly_schedule_id:   baseAsmSched      || null,
      wall_assembly_schedule_id:   wallAsmSched      || null,
      tall_assembly_schedule_id:   tallAsmSched      || null,
      drawerbox_schedule_id:       drawerBoxSched    || null,
      inner_drawerbox_schedule_id: innerDbSched      || null,
      handle_schedule_id:          handleSched       || null,
      slide_schedule_id:           slideSched        || null,
      hinge_schedule_id:           hingeSched        || null,
    }).select().single()
    if (data) setPresets(prev => [...prev, data as JobPreset].sort((a, b) => a.name.localeCompare(b.name)))
    setSavePresetOpen(false)
    setNewPresetName('')
  }

  // Colours available for a given style's material schedule.
  function coloursForStyle(styleId: string): ColourItem[] {
    const schedId = styleId ? styleSchedMap[styleId] ?? null : null
    return schedId ? doorColours.filter(c => c.schedule_id === schedId) : []
  }
  // Per-class door rows: each inherits the job default style unless overridden,
  // and its colour is drawn from whichever style is effective for that class.
  const doorClassRows = [
    { key: 'base', label: 'Base', style: baseDoorStyle, setStyle: setBaseDoorStyle, colour: baseDoorColour, setColour: setBaseDoorColour },
    { key: 'wall', label: 'Wall', style: wallDoorStyle, setStyle: setWallDoorStyle, colour: wallDoorColour, setColour: setWallDoorColour },
    { key: 'tall', label: 'Tall', style: tallDoorStyle, setStyle: setTallDoorStyle, colour: tallDoorColour, setColour: setTallDoorColour },
  ] as const

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onPointerDown={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[700px] h-[85vh] flex flex-col"
        onPointerDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0">
          <div>
            <p className="text-sm font-semibold text-white">Job Properties</p>
            <p className="text-xs text-gray-500 mt-0.5">{project.name}</p>
          </div>
          <button onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-base leading-none px-1">✕</button>
        </div>

        {/* Outer tabs */}
        <div className="flex border-b border-gray-800 px-4 shrink-0">
          {OUTER_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-xs transition-colors border-b-2 -mb-px whitespace-nowrap ${
                tab === t.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── Details ── */}
          {tab === 'details' && (
            <div className="space-y-4 max-w-md">
              <Field label="Job Name">
                <input value={name} onChange={e => setName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
              </Field>
              <Field label="Job Number">
                <input value={jobNumber} onChange={e => setJobNumber(e.target.value)}
                  placeholder="e.g. JOB-001"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
              </Field>
              <Field label="Status">
                <select value={status} onChange={e => setStatus(e.target.value as ProjectStatus)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500">
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </Field>
              <Field label="Client Name">
                <input value={clientName} onChange={e => setClientName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
              </Field>
              <Field label="Client Address">
                <textarea value={clientAddress} onChange={e => setClientAddress(e.target.value)} rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
              </Field>
              <Field label="Notes">
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
              </Field>
            </div>
          )}

          {/* ── Cabinet Standards ── */}
          {tab === 'cabinet_standards' && (
            <div className="flex flex-col h-full">
              {/* Preset bar */}
              <div className="flex items-center gap-2 -mt-1 mb-3 shrink-0">
                <select
                  defaultValue=""
                  onChange={e => {
                    const p = presets.find(x => x.id === e.target.value)
                    if (p) applyPreset(p)
                    e.target.value = ''
                  }}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="" disabled>Load preset…</option>
                  {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {savePresetOpen ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={newPresetName}
                      onChange={e => setNewPresetName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') { setSavePresetOpen(false); setNewPresetName('') } }}
                      placeholder="Preset name…"
                      className="bg-gray-800 border border-blue-600 rounded px-2 py-1.5 text-xs text-white focus:outline-none w-36"
                    />
                    <button onClick={savePreset}
                      className="px-2 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors">Save</button>
                    <button onClick={() => { setSavePresetOpen(false); setNewPresetName('') }}
                      className="px-2 py-1.5 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors">✕</button>
                  </div>
                ) : (
                  <button onClick={() => setSavePresetOpen(true)}
                    className="px-3 py-1.5 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors whitespace-nowrap">
                    Save as preset…
                  </button>
                )}
              </div>

              {/* Inner tabs */}
              <div className="flex border-b border-gray-800 mb-4 shrink-0">
                {CS_TABS.map(t => (
                  <button key={t.id} onClick={() => setCsTab(t.id)}
                    className={`px-4 py-1.5 text-xs transition-colors border-b-2 -mb-px whitespace-nowrap ${
                      csTab === t.id
                        ? 'border-blue-500 text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Construction Methods */}
              {csTab === 'construction' && (
                <div className="space-y-6">

                  {/* Cabinet size defaults */}
                  <section>
                    <SectionHead>Cabinet Size Defaults</SectionHead>
                    <p className="text-xs text-gray-500 mb-3">Applied when placing new cabinets. Can be overridden per-cabinet.</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 text-left">
                          <th className="pb-3 font-medium">Class</th>
                          <th className="pb-3 font-medium text-right pr-6">Height dy (mm)</th>
                          <th className="pb-3 font-medium text-right">Depth dz (mm)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {[
                          { label: 'Base', dy: baseDy, dz: baseDz, setDy: setBaseDy, setDz: setBaseDz, sysDy: DEFAULT_DIMS.base.dy, sysDz: DEFAULT_DIMS.base.dz },
                          { label: 'Wall', dy: wallDy, dz: wallDz, setDy: setWallDy, setDz: setWallDz, sysDy: DEFAULT_DIMS.wall.dy, sysDz: DEFAULT_DIMS.wall.dz },
                          { label: 'Tall', dy: tallDy, dz: tallDz, setDy: setTallDy, setDz: setTallDz, sysDy: DEFAULT_DIMS.tall.dy, sysDz: DEFAULT_DIMS.tall.dz },
                        ].map(row => (
                          <tr key={row.label}>
                            <td className="py-3 text-gray-300 font-medium">{row.label}</td>
                            <td className="py-3 pr-6">
                              <div className="flex justify-end">
                                <NumInput value={row.dy} onChange={row.setDy} baseline={row.sysDy} />
                              </div>
                            </td>
                            <td className="py-3">
                              <div className="flex justify-end">
                                <NumInput value={row.dz} onChange={row.setDz} baseline={row.sysDz} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-xs text-gray-600 mt-1">Blue = overrides system default</p>
                  </section>

                  {/* Cabinet construction method */}
                  <section>
                    <SectionHead>Cabinet Construction Method</SectionHead>
                    {schedLoading ? (
                      <p className="text-xs text-gray-500">Loading…</p>
                    ) : (
                      <select
                        value={constructionSched}
                        onChange={e => setConstructionSched(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="">— shop default —</option>
                        {constructionScheds.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name}{s.is_default ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </section>

                  {/* Drawer box construction method (face drawers) */}
                  <section>
                    <SectionHead>Drawer Box Construction Method</SectionHead>
                    {schedLoading ? (
                      <p className="text-xs text-gray-500">Loading…</p>
                    ) : (
                      <select
                        value={drawerBoxMethod}
                        onChange={e => setDrawerBoxMethod(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="">— shop default —</option>
                        {drawerBoxMethods.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}{m.is_default ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-[10px] text-gray-500 mt-1">Used for face drawers; also used for inner drawers when no inner-specific method is set below.</p>
                  </section>

                  {/* Inner drawer box construction method */}
                  <section>
                    <SectionHead>Inner Drawer Construction Method</SectionHead>
                    {schedLoading ? (
                      <p className="text-xs text-gray-500">Loading…</p>
                    ) : (
                      <select
                        value={innerDrawerBoxMethod}
                        onChange={e => setInnerDrawerBoxMethod(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="">— inherit from face method —</option>
                        {drawerBoxMethods.filter(m => m.kind === 'internal').map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}{m.is_default ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-[10px] text-gray-500 mt-1">Only methods tagged kind = &ldquo;internal&rdquo; in the drawer-boxes library appear here. Leave blank to use the face method above.</p>
                  </section>

                  {/* Cabinet method rule overrides */}
                  <section>
                    <SectionHead>Cabinet Method Overrides</SectionHead>
                    {RULE_GROUPS.map(group => (
                      <div key={group.label} className="mb-3">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{group.label}</p>
                        <div className="space-y-px">
                          {group.keys.map(k => (
                            <RuleRow key={k} ruleKey={k} value={rules[k]} baseline={SYS[k]}
                              baselineLabel="system"
                              onChange={v => setRule(k, v as Rules[typeof k])} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>

                  <SaveDefaultsButton onClick={saveConstructionDefaults} saving={savingDefaults} />

                </div>
              )}

              {/* Material Schedules */}
              {csTab === 'materials' && (
                <div className="space-y-5">
                  {schedLoading ? (
                    <p className="text-xs text-gray-500">Loading schedules…</p>
                  ) : (
                    <>
                      <section>
                        <SectionHead>Assembly Schedules</SectionHead>
                        <p className="text-xs text-gray-500 mb-3">Per cabinet class. Leave blank to inherit the shop default.</p>
                        <div className="space-y-3">
                          {([
                            { label: 'Base', value: baseAsmSched, set: setBaseAsmSched },
                            { label: 'Wall', value: wallAsmSched, set: setWallAsmSched },
                            { label: 'Tall', value: tallAsmSched, set: setTallAsmSched },
                          ] as const).map(zone => (
                            <div key={zone.label} className="flex items-center gap-4">
                              <span className="w-10 shrink-0 text-xs font-medium text-gray-300">{zone.label}</span>
                              <select
                                value={zone.value}
                                onChange={e => zone.set(e.target.value)}
                                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                              >
                                <option value="">— shop default —</option>
                                {asmSchedules.map(s => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}{s.is_default ? ' (default)' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section>
                        <SectionHead>Drawer Box Schedules</SectionHead>
                        <p className="text-xs text-gray-500 mb-3">Leave blank to inherit the shop default.</p>
                        <div className="space-y-3">
                          <SchedPicker label="Drawer Box"       value={drawerBoxSched} onChange={setDrawerBoxSched} items={drawerBoxScheds}      />
                          <SchedPicker label="Inner Drawer Box" value={innerDbSched}   onChange={setInnerDbSched}   items={innerDrawerBoxScheds} />
                        </div>
                      </section>

                      <SaveDefaultsButton onClick={saveMaterialDefaults} saving={savingDefaults} />
                    </>
                  )}
                </div>
              )}

              {/* Hardware Schedules */}
              {csTab === 'hardware' && (
                <div className="space-y-5">
                  <p className="text-xs text-gray-500">
                    Assign hardware schedules for this job. Leave blank to inherit the shop default.
                  </p>
                  {schedLoading ? (
                    <p className="text-xs text-gray-500">Loading schedules…</p>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <SchedPicker label="Handles" value={handleSched} onChange={setHandleSched} items={handleScheds} />
                        <SchedPicker label="Slides"  value={slideSched}  onChange={setSlideSched}  items={slideScheds}  />
                        <SchedPicker label="Hinges"  value={hingeSched}  onChange={setHingeSched}  items={hingeScheds}  />
                      </div>
                      <SaveDefaultsButton onClick={saveHardwareDefaults} saving={savingDefaults} />
                    </>
                  )}
                </div>
              )}

              {/* Doors */}
              {csTab === 'doors' && (
                <div className="space-y-5">
                  {schedLoading ? (
                    <p className="text-xs text-gray-500">Loading styles…</p>
                  ) : (
                    <>
                      <section>
                        <SectionHead>Default Door Style</SectionHead>
                        <p className="text-xs text-gray-500 mb-3">
                          The job&apos;s parent style. Each cabinet class below inherits it unless overridden.
                          Rooms and individual door zones can still override per zone. Manage styles in the Doors Library.
                        </p>
                        <SchedPicker label="Door Style" value={doorStyle} onChange={setDoorStyle} items={doorStyles} />
                      </section>

                      <section>
                        <SectionHead>Per Cabinet Class</SectionHead>
                        <p className="text-xs text-gray-500 mb-3">
                          Override the style and/or colour for Base, Wall and Tall (e.g. Polytec on base &amp; wall,
                          Shaker or raw MDF on tall). Leave a style on &ldquo;job default&rdquo; to inherit the parent above.
                        </p>
                        {!doorStyle ? (
                          <p className="text-xs text-gray-500">Choose a default door style first.</p>
                        ) : (
                          <div className="space-y-4">
                            {doorClassRows.map(row => {
                              const effStyle  = row.style || doorStyle
                              const colourOpts = coloursForStyle(effStyle)
                              const effName    = doorStyles.find(s => s.id === effStyle)?.name ?? '—'
                              return (
                                <div key={row.key} className="border border-gray-800 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center gap-4">
                                    <span className="w-10 shrink-0 text-xs font-semibold text-gray-200">{row.label}</span>
                                    <select
                                      value={row.style}
                                      onChange={e => row.setStyle(e.target.value)}
                                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                                    >
                                      <option value="">— job default ({effName}) —</option>
                                      {doorStyles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                  </div>
                                  <div className="flex items-center gap-4 pl-14">
                                    {colourOpts.length === 0 ? (
                                      <span className="text-[11px] text-gray-500">No colours in this style&apos;s schedule.</span>
                                    ) : (
                                      <select
                                        value={row.colour}
                                        onChange={e => row.setColour(e.target.value)}
                                        className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                                      >
                                        <option value="">— style default colour —</option>
                                        {colourOpts.map(c => (
                                          <option key={c.id} value={c.id}>
                                            {c.colour_name}{c.colour_code ? ` (${c.colour_code})` : ''}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </section>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Overrides ── */}
          {tab === 'overrides' && (
            overrideKeys.length === 0 ? (
              <EmptyState
                title="No overrides"
                body="All construction rules are using system defaults." />
            ) : (
              <div>
                <p className="text-xs text-gray-500 mb-3">
                  {overrideKeys.length} rule{overrideKeys.length !== 1 ? 's' : ''} overriding system defaults.
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 text-left border-b border-gray-800">
                      <th className="pb-2 font-medium">Rule</th>
                      <th className="pb-2 font-medium text-right pr-6">System Default</th>
                      <th className="pb-2 font-medium text-right">Job Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {overrideKeys.map(k => (
                      <tr key={k}>
                        <td className="py-2 text-gray-300">{RULE_LABELS[k]}</td>
                        <td className="py-2 text-right pr-6 text-gray-600 font-mono">{String(SYS[k])}</td>
                        <td className="py-2 text-right text-blue-400 font-mono">{String(rules[k])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-800 shrink-0">
          <button onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors">
            Save
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionHead({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{children}</p>
}

function SchedPicker({ label, value, onChange, items }: {
  label: string
  value: string
  onChange: (v: string) => void
  items: SchedItem[]
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-32 shrink-0 text-xs font-medium text-gray-300">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
      >
        <option value="">— shop default —</option>
        {items.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}{s.is_default ? ' (default)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

function NumInput({ value, onChange, baseline }: { value: number; onChange: (v: number) => void; baseline: number }) {
  const isOverridden = value !== baseline
  return (
    <input type="number" value={value}
      onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) onChange(v) }}
      className={`w-24 bg-gray-800 border rounded px-2 py-1 text-xs text-right font-mono focus:outline-none focus:border-blue-500 ${
        isOverridden ? 'border-blue-700 text-blue-300' : 'border-gray-700 text-white'
      }`}
    />
  )
}

function RuleRow({ ruleKey, value, baseline, baselineLabel, onChange }: {
  ruleKey: RuleKey
  value: Rules[RuleKey]
  baseline: Rules[RuleKey]
  baselineLabel: string
  onChange: (v: Rules[RuleKey]) => void
}) {
  const isOverridden = value !== baseline
  const label   = RULE_LABELS[ruleKey]
  const rowCls  = `flex items-center justify-between py-1.5 px-2 rounded ${isOverridden ? 'bg-blue-950/30' : 'hover:bg-gray-800/40'}`
  const textCls = `text-xs ${isOverridden ? 'text-blue-300' : 'text-gray-400'}`
  const inputCls = `bg-gray-800 border rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-blue-500 ${
    isOverridden ? 'border-blue-700 text-blue-300' : 'border-gray-700 text-white'
  }`

  if (ruleKey === 'TOE_TYPE') {
    return (
      <div className={rowCls}>
        <span className={textCls}>{label}</span>
        <div className="flex items-center gap-2">
          {isOverridden && <span className="text-gray-600 text-[10px]">{baselineLabel}: {String(baseline)}</span>}
          <select value={value as string} onChange={e => onChange(e.target.value as Rules[RuleKey])}
            className={inputCls}>
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
        <span className={textCls}>{label}</span>
        <div className="flex items-center gap-2">
          {isOverridden && <span className="text-gray-600 text-[10px]">{baselineLabel}: {String(baseline)}</span>}
          <select value={value as string} onChange={e => onChange(e.target.value as Rules[RuleKey])}
            className={inputCls}>
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
      <span className={textCls}>{label}</span>
      <div className="flex items-center gap-2">
        {isOverridden && <span className="text-gray-600 text-[10px]">{baselineLabel}: {String(baseline)}</span>}
        <input type="number" value={value as number}
          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onChange(v as Rules[RuleKey]) }}
          className={`w-20 text-right ${inputCls}`}
        />
      </div>
    </div>
  )
}

function SaveDefaultsButton({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <div className="pt-4 border-t border-gray-800 mt-2">
      <button
        onClick={onClick}
        disabled={saving}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save as shop defaults'}
      </button>
      <p className="text-[10px] text-gray-600 mt-0.5">Updates shop-wide defaults for all future jobs.</p>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-xs text-gray-600 max-w-sm">{body}</p>
    </div>
  )
}
