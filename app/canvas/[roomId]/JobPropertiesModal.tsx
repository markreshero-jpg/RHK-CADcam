'use client'
import { useState } from 'react'
import { Project, ProjectStatus, DEFAULT_DIMS } from '@/src/lib/types'
import { DEFAULT_CONSTRUCTION_METHOD } from '@/src/lib/defaults/constructionMethod'

export type JobPropertiesTab = 'details' | 'dimensions' | 'construction' | 'hardware' | 'overrides'

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
  { label: 'Toe Kick',          keys: ['TOEH', 'TOE_TYPE', 'TOESP', 'TOESCF', 'TOESCB', 'TOESCL', 'TOESCR'] },
  { label: 'Case Scribes',      keys: ['SCRBK', 'SCRBT', 'SCRL', 'SCRR', 'SCRT'] },
  { label: 'Top Rail',          keys: ['TOP_TYPE', 'RD'] },
  { label: 'Adjustable Shelves',keys: ['ADJSB_F', 'ADJSB_B', 'ADJSL', 'ADJSR'] },
  { label: 'Fixed Shelves',     keys: ['FIXSB_F', 'FIXSB_B'] },
  { label: 'Inner Drawers',     keys: ['IDCL', 'IDCR', 'IDFAO', 'IDRUN'] },
  { label: 'Face Reveals',      keys: ['REVT', 'REVB', 'REVL', 'REVR', 'REVENDL', 'REVENDR', 'GAPC', 'GAPR'] },
  { label: 'Face Clearance',    keys: ['FACBUF', 'FACINS'] },
]

const STATUS_OPTIONS: ProjectStatus[] = ['draft', 'quoted', 'approved', 'in_production', 'completed', 'archived']

interface ClassDimDefaults {
  base?: { dy?: number; dz?: number }
  wall?: { dy?: number; dz?: number }
  tall?: { dy?: number; dz?: number }
}

export default function JobPropertiesModal({ project, initialTab, onClose, onSave }: {
  project: Project
  initialTab: JobPropertiesTab
  onClose: () => void
  onSave: (updates: Partial<Project>) => Promise<void>
}) {
  const [tab, setTab] = useState<JobPropertiesTab>(initialTab)

  // Details
  const [name, setName] = useState(project.name)
  const [clientName, setClientName] = useState(project.client_name ?? '')
  const [clientAddress, setClientAddress] = useState(project.client_address ?? '')
  const [status, setStatus] = useState<ProjectStatus>(project.status)
  const [notes, setNotes] = useState(project.notes ?? '')

  // Dimensions
  const cd = project.class_dimension_defaults as ClassDimDefaults
  const [baseDy, setBaseDy] = useState(cd.base?.dy ?? DEFAULT_DIMS.base.dy)
  const [baseDz, setBaseDz] = useState(cd.base?.dz ?? DEFAULT_DIMS.base.dz)
  const [wallDy, setWallDy] = useState(cd.wall?.dy ?? DEFAULT_DIMS.wall.dy)
  const [wallDz, setWallDz] = useState(cd.wall?.dz ?? DEFAULT_DIMS.wall.dz)
  const [tallDy, setTallDy] = useState(cd.tall?.dy ?? DEFAULT_DIMS.tall.dy)
  const [tallDz, setTallDz] = useState(cd.tall?.dz ?? DEFAULT_DIMS.tall.dz)

  // Construction — start from system defaults merged with project overrides
  const [rules, setRules] = useState<Rules>({
    ...SYS,
    ...(project.rule_overrides as Partial<Rules>),
  })

  function setRule<K extends RuleKey>(key: K, value: Rules[K]) {
    setRules(prev => ({ ...prev, [key]: value }))
  }

  const overrideKeys = (Object.keys(SYS) as RuleKey[]).filter(k => rules[k] !== SYS[k])

  const TABS: { id: JobPropertiesTab; label: string }[] = [
    { id: 'details',      label: 'Details' },
    { id: 'dimensions',   label: 'Dimensions' },
    { id: 'construction', label: 'Construction' },
    { id: 'hardware',     label: 'Hardware' },
    { id: 'overrides',    label: overrideKeys.length > 0 ? `Overrides (${overrideKeys.length})` : 'Overrides' },
  ]

  async function handleSave() {
    const newOverrides: Partial<Rules> = {}
    for (const k of Object.keys(SYS) as RuleKey[]) {
      if (rules[k] !== SYS[k]) (newOverrides as Record<string, unknown>)[k] = rules[k]
    }
    await onSave({
      name: name.trim() || project.name,
      client_name: clientName.trim() || null,
      client_address: clientAddress.trim() || null,
      status,
      notes: notes.trim() || null,
      rule_overrides: newOverrides as Record<string, unknown>,
      class_dimension_defaults: {
        base: { dy: baseDy, dz: baseDz },
        wall: { dy: wallDy, dz: wallDz },
        tall: { dy: tallDy, dz: tallDz },
      },
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onPointerDown={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[700px] max-h-[85vh] flex flex-col"
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

        {/* Tabs */}
        <div className="flex border-b border-gray-800 px-4 shrink-0">
          {TABS.map(t => (
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

          {tab === 'details' && (
            <div className="space-y-4 max-w-md">
              <Field label="Job Name">
                <input value={name} onChange={e => setName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
              </Field>
              <Field label="Status">
                <select value={status} onChange={e => setStatus(e.target.value as ProjectStatus)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500">
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
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

          {tab === 'dimensions' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">Defaults applied when placing new cabinets. Can be overridden per-cabinet.</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 text-left">
                    <th className="pb-3 font-medium">Cabinet Class</th>
                    <th className="pb-3 font-medium text-right pr-6">Height dy (mm)</th>
                    <th className="pb-3 font-medium text-right">Depth dz (mm)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {[
                    { label: 'Base',  dy: baseDy, dz: baseDz, setDy: setBaseDy, setDz: setBaseDz, sysDy: DEFAULT_DIMS.base.dy, sysDz: DEFAULT_DIMS.base.dz },
                    { label: 'Wall',  dy: wallDy, dz: wallDz, setDy: setWallDy, setDz: setWallDz, sysDy: DEFAULT_DIMS.wall.dy, sysDz: DEFAULT_DIMS.wall.dz },
                    { label: 'Tall',  dy: tallDy, dz: tallDz, setDy: setTallDy, setDz: setTallDz, sysDy: DEFAULT_DIMS.tall.dy, sysDz: DEFAULT_DIMS.tall.dz },
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
              <p className="text-xs text-gray-600">Blue = overrides system default</p>
            </div>
          )}

          {tab === 'construction' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg text-xs">
                <span className="text-gray-400">Method</span>
                <span className="text-white font-medium">{DEFAULT_CONSTRUCTION_METHOD.name}</span>
                <span className="text-gray-600 ml-auto">Override per-room or per-cabinet</span>
              </div>
              {RULE_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group.label}</p>
                  <div className="space-y-px">
                    {group.keys.map(k => (
                      <RuleRow key={k} ruleKey={k} value={rules[k]} baseline={SYS[k]}
                        baselineLabel="system"
                        onChange={v => setRule(k, v as Rules[typeof k])} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'hardware' && (
            <EmptyState
              title="Hardware library"
              body="Hinges, runners, and hardware defaults will be configured here once the hardware library is built." />
          )}

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
  const label = RULE_LABELS[ruleKey]
  const rowCls = `flex items-center justify-between py-1.5 px-2 rounded ${isOverridden ? 'bg-blue-950/30' : 'hover:bg-gray-800/40'}`
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
