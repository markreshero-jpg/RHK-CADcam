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
  IDCL:    'Drawer Box Clearance Left (mm)',
  IDCR:    'Drawer Box Clearance Right (mm)',
  IDFAO:   'Drawer Box Face Above Opening (mm)',
  IDRUN:   'Drawer Box Runner Length (mm)',
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
  { label: 'Inner Drawers',      keys: ['IDCL', 'IDCR', 'IDFAO', 'IDRUN'] },
  { label: 'Face Reveals',       keys: ['REVT', 'REVB', 'REVL', 'REVR', 'REVENDL', 'REVENDR', 'GAPC', 'GAPR'] },
  { label: 'Face Clearance',     keys: ['FACBUF', 'FACINS'] },
]

const STATUS_OPTIONS: ProjectStatus[] = ['draft', 'quoted', 'approved', 'in_production', 'completed', 'archived']

interface ClassDimDefaults {
  base?: { dy?: number; dz?: number }
  wall?: { dy?: number; dz?: number }
  tall?: { dy?: number; dz?: number }
}

type SchedItem = { id: string; name: string; is_default: boolean }

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
  const [constructionSched,   setConstructionSched]   = useState(project.construction_schedule_id ?? '')
  const [drawerBoxMethod,     setDrawerBoxMethod]     = useState(project.drawer_box_method_id ?? '')
  const [constructionScheds,  setConstructionScheds]  = useState<SchedItem[]>([])
  const [drawerBoxMethods,    setDrawerBoxMethods]    = useState<SchedItem[]>([])

  // ── Material schedules (per zone) ─────────────────────────────────────────
  const [baseAsmSched, setBaseAsmSched] = useState(project.base_assembly_schedule_id ?? '')
  const [wallAsmSched, setWallAsmSched] = useState(project.wall_assembly_schedule_id ?? '')
  const [tallAsmSched, setTallAsmSched] = useState(project.tall_assembly_schedule_id ?? '')
  const [asmSchedules,  setAsmSchedules]  = useState<SchedItem[]>([])

  // ── Hardware schedules ────────────────────────────────────────────────────
  const [handleSched, setHandleSched] = useState(project.handle_schedule_id ?? '')
  const [slideSched,  setSlideSched]  = useState(project.slide_schedule_id  ?? '')
  const [hingeSched,  setHingeSched]  = useState(project.hinge_schedule_id  ?? '')
  const [handleScheds, setHandleScheds] = useState<SchedItem[]>([])
  const [slideScheds,  setSlideScheds]  = useState<SchedItem[]>([])
  const [hingeScheds,  setHingeScheds]  = useState<SchedItem[]>([])
  const [schedLoading, setSchedLoading] = useState(false)

  // ── Load all schedule/method lists on mount ───────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      setSchedLoading(true)
      const [cmsR, dbmR, asmR, hdlR, slR, hiR] = await Promise.all([
        supabase.from('construction_method_schedules').select('id,name,is_default').order('name'),
        supabase.from('drawer_box_methods').select('id,name,is_default').eq('active', true).order('name'),
        supabase.from('assembly_schedules').select('id,name,is_default').eq('active', true).order('name'),
        supabase.from('handle_schedules').select('id,name,is_default').eq('active', true).order('name'),
        supabase.from('slide_schedules').select('id,name,is_default').eq('active', true).order('name'),
        supabase.from('hinge_schedules').select('id,name,is_default').eq('active', true).order('name'),
      ])
      if (cancelled) return
      setConstructionScheds((cmsR.data ?? []) as SchedItem[])
      setDrawerBoxMethods(  (dbmR.data ?? []) as SchedItem[])
      setAsmSchedules(      (asmR.data ?? []) as SchedItem[])
      setHandleScheds(      (hdlR.data ?? []) as SchedItem[])
      setSlideScheds(       (slR.data  ?? []) as SchedItem[])
      setHingeScheds(       (hiR.data  ?? []) as SchedItem[])
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
      construction_schedule_id: constructionSched || null,
      drawer_box_method_id:     drawerBoxMethod  || null,
      base_assembly_schedule_id: baseAsmSched || null,
      wall_assembly_schedule_id: wallAsmSched || null,
      tall_assembly_schedule_id: tallAsmSched || null,
      handle_schedule_id: handleSched || null,
      slide_schedule_id:  slideSched  || null,
      hinge_schedule_id:  hingeSched  || null,
    })
    onClose()
  }

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
              {/* Inner tabs */}
              <div className="flex border-b border-gray-800 -mt-1 mb-4 shrink-0">
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

                  {/* Drawer box construction method */}
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

                </div>
              )}

              {/* Material Schedules */}
              {csTab === 'materials' && (
                <div className="space-y-5">
                  <p className="text-xs text-gray-500">
                    Assign an assembly material schedule per cabinet class. Leave blank to inherit the shop default.
                  </p>
                  {schedLoading ? (
                    <p className="text-xs text-gray-500">Loading schedules…</p>
                  ) : (
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
                    <div className="space-y-3">
                      <SchedPicker label="Handles" value={handleSched} onChange={setHandleSched} items={handleScheds} />
                      <SchedPicker label="Slides"  value={slideSched}  onChange={setSlideSched}  items={slideScheds}  />
                      <SchedPicker label="Hinges"  value={hingeSched}  onChange={setHingeSched}  items={hingeScheds}  />
                    </div>
                  )}
                </div>
              )}

              {/* Doors */}
              {csTab === 'doors' && (
                <EmptyState
                  title="Door configuration"
                  body="Door build type (shaker, flat panel, etc.), style, and material will be configured here." />
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
      <span className="w-16 shrink-0 text-xs font-medium text-gray-300">{label}</span>
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

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-xs text-gray-600 max-w-sm">{body}</p>
    </div>
  )
}
