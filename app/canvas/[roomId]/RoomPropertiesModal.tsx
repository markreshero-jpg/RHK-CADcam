'use client'
import { useState, useEffect } from 'react'
import { Room, Project } from '@/src/lib/types'
import { DEFAULT_CONSTRUCTION_METHOD } from '@/src/lib/defaults/constructionMethod'
import { supabase } from '@/src/lib/supabase'
import MaterialsScheduleTab from './MaterialsScheduleTab'

type DrawerBoxMethodItem = { id: string; name: string; is_default: boolean; kind?: 'external' | 'internal' | null }

export type RoomPropertiesTab = 'details' | 'construction' | 'materials' | 'hardware' | 'overrides'

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
  IDCL:          'Drawer Box Clearance Left (mm)',
  IDCR:          'Drawer Box Clearance Right (mm)',
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
  { label: 'Toe Kick',          keys: ['TOEH', 'TOE_TYPE', 'TOESP', 'TOESCF', 'TOESCB', 'TOESCL', 'TOESCR'] },
  { label: 'Case Scribes',      keys: ['SCRBK', 'SCRBT', 'SCRL', 'SCRR', 'SCRT'] },
  { label: 'Top Rail',          keys: ['TOP_TYPE', 'RD'] },
  { label: 'Adjustable Shelves',keys: ['ADJSB_F', 'ADJSB_B', 'ADJSL', 'ADJSR'] },
  { label: 'Fixed Shelves',     keys: ['FIXSB_F', 'FIXSB_B'] },
  { label: 'Inner Drawers',     keys: ['IDCL', 'IDCR', 'IDFAO', 'SLIDE_SETBACK'] },
  { label: 'Face Reveals',      keys: ['REVT', 'REVB', 'REVL', 'REVR', 'REVENDL', 'REVENDR', 'GAPC', 'GAPR'] },
  { label: 'Face Clearance',    keys: ['FACBUF', 'FACINS'] },
]

// Computes job-effective rules: system defaults + project overrides
function jobEffective(project: Project | null): Rules {
  if (!project) return { ...SYS }
  return { ...SYS, ...(project.rule_overrides as Partial<Rules>) }
}

export default function RoomPropertiesModal({ room, project, initialTab, onClose, onSave }: {
  room: Room
  project: Project | null
  initialTab: RoomPropertiesTab
  onClose: () => void
  onSave: (updates: Partial<Room>) => Promise<void>
}) {
  const [tab, setTab] = useState<RoomPropertiesTab>(initialTab)

  // Details
  const [name, setName] = useState(room.name)
  const [roomDx, setRoomDx] = useState(room.room_dx ?? '')
  const [roomDy, setRoomDy] = useState(room.room_dy ?? '')
  const [roomDz, setRoomDz] = useState(room.room_dz ?? '')
  const [soffitHeight, setSoffitHeight] = useState(room.soffit_height ?? '')
  const [wallCabTop, setWallCabTop] = useState(room.wall_cabinet_top ?? '')
  const [notes, setNotes] = useState(room.notes ?? '')

  // Construction — baseline is job-effective rules; room can override per-key
  const jobRules = jobEffective(project)
  const [rules, setRules] = useState<Rules>({
    ...jobRules,
    ...(room.rule_overrides as Partial<Rules>),
  })

  // Inner-drawer construction method — empty string = inherit from job
  const [innerDrawerBoxMethod, setInnerDrawerBoxMethod] = useState(room.inner_drawer_box_method_id ?? '')
  const [drawerBoxMethods, setDrawerBoxMethods] = useState<DrawerBoxMethodItem[]>([])
  const [methodsLoading, setMethodsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('drawer_box_methods')
      .select('id,name,is_default,kind')
      .eq('active', true)
      .order('name')
      .then(({ data }) => {
        if (cancelled) return
        setDrawerBoxMethods((data ?? []) as DrawerBoxMethodItem[])
        setMethodsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const innerMethods = drawerBoxMethods.filter(m => m.kind === 'internal')
  const jobInnerMethodName = project?.inner_drawer_box_method_id
    ? drawerBoxMethods.find(m => m.id === project.inner_drawer_box_method_id)?.name
    : project?.drawer_box_method_id
      ? drawerBoxMethods.find(m => m.id === project.drawer_box_method_id)?.name
      : null

  function setRule<K extends RuleKey>(key: K, value: Rules[K]) {
    setRules(prev => ({ ...prev, [key]: value }))
  }

  // Keys where room's value differs from job-effective
  const overrideKeys = (Object.keys(SYS) as RuleKey[]).filter(k => rules[k] !== jobRules[k])

  const TABS: { id: RoomPropertiesTab; label: string }[] = [
    { id: 'details',      label: 'Room Details' },
    { id: 'construction', label: 'Construction' },
    { id: 'materials',    label: 'Materials' },
    { id: 'hardware',     label: 'Hardware' },
    { id: 'overrides',    label: overrideKeys.length > 0 ? `Overrides (${overrideKeys.length})` : 'Overrides' },
  ]

  async function handleSave() {
    // Only store keys that differ from job-effective rules
    const newOverrides: Partial<Rules> = {}
    for (const k of Object.keys(SYS) as RuleKey[]) {
      if (rules[k] !== jobRules[k]) (newOverrides as Record<string, unknown>)[k] = rules[k]
    }
    await onSave({
      name: name.trim() || room.name,
      room_dx: roomDx === '' ? null : Number(roomDx),
      room_dy: roomDy === '' ? null : Number(roomDy),
      room_dz: roomDz === '' ? null : Number(roomDz),
      soffit_height: soffitHeight === '' ? null : Number(soffitHeight),
      wall_cabinet_top: wallCabTop === '' ? null : Number(wallCabTop),
      notes: notes.trim() || null,
      rule_overrides: newOverrides as Record<string, unknown>,
      inner_drawer_box_method_id: innerDrawerBoxMethod || null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onPointerDown={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[700px] h-[85vh] flex flex-col"
        onPointerDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0">
          <div>
            <p className="text-sm font-semibold text-white">Room Properties</p>
            <p className="text-xs text-gray-500 mt-0.5">{room.name}</p>
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
              <Field label="Room Name">
                <input value={name} onChange={e => setName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
              </Field>

              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Room Dimensions</p>
                <div className="space-y-3">
                  <DimField label="Room Width  (mm)" placeholder="not set" value={String(roomDx)} onChange={setRoomDx} />
                  <DimField label="Ceiling Height (mm)" placeholder="not set" value={String(roomDy)} onChange={setRoomDy} />
                  <DimField label="Room Depth  (mm)" placeholder="not set" value={String(roomDz)} onChange={setRoomDz} />
                </div>
              </div>

              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Cabinet Heights</p>
                <div className="space-y-3">
                  <DimField label="Soffit Height (mm)" placeholder="not set" value={String(soffitHeight)} onChange={setSoffitHeight} />
                  <DimField label="Wall Cabinet Top (mm)" placeholder="not set" value={String(wallCabTop)} onChange={setWallCabTop} />
                </div>
              </div>

              <Field label="Notes">
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
              </Field>
            </div>
          )}

          {tab === 'construction' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg text-xs">
                <span className="text-gray-400">Inheriting from</span>
                <span className="text-white font-medium">{project?.name ?? 'Job'}</span>
                <span className="text-gray-600 ml-auto">Blue = room override</span>
              </div>

              {/* Inner drawer construction method */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Inner Drawer Construction Method</p>
                {methodsLoading ? (
                  <p className="text-xs text-gray-500">Loading…</p>
                ) : (
                  <select
                    value={innerDrawerBoxMethod}
                    onChange={e => setInnerDrawerBoxMethod(e.target.value)}
                    className={`w-full bg-gray-800 border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 ${
                      innerDrawerBoxMethod ? 'border-blue-700 text-blue-300' : 'border-gray-700 text-white'
                    }`}
                  >
                    <option value="">— inherit from job{jobInnerMethodName ? ` (${jobInnerMethodName})` : ''} —</option>
                    {innerMethods.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}{m.is_default ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-gray-500 mt-1">Overrides the job-level inner drawer method for cabinets in this room only.</p>
              </div>

              {RULE_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group.label}</p>
                  <div className="space-y-px">
                    {group.keys.map(k => (
                      <RuleRow key={k} ruleKey={k} value={rules[k]} baseline={jobRules[k]}
                        baselineLabel="job"
                        onChange={v => setRule(k, v as Rules[typeof k])} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'materials' && (
            <MaterialsScheduleTab mode="room" projectId={room.project_id} roomId={room.id} />
          )}

          {tab === 'hardware' && (
            <EmptyState
              title="Hardware overrides"
              body="Room-level hardware overrides (hinges, runners) will be configurable here." />
          )}

          {tab === 'overrides' && (
            overrideKeys.length === 0 ? (
              <EmptyState
                title="No room overrides"
                body="This room inherits all construction rules from the job." />
            ) : (
              <div>
                <p className="text-xs text-gray-500 mb-3">
                  {overrideKeys.length} rule{overrideKeys.length !== 1 ? 's' : ''} overriding job defaults.
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 text-left border-b border-gray-800">
                      <th className="pb-2 font-medium">Rule</th>
                      <th className="pb-2 font-medium text-right pr-6">Job Value</th>
                      <th className="pb-2 font-medium text-right">Room Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {overrideKeys.map(k => (
                      <tr key={k}>
                        <td className="py-2 text-gray-300">{RULE_LABELS[k]}</td>
                        <td className="py-2 text-right pr-6 text-gray-600 font-mono">{String(jobRules[k])}</td>
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

function DimField({ label, value, placeholder, onChange }: {
  label: string; value: string; placeholder: string; onChange: (v: string) => void
}) {
  const isEmpty = value === '' || value === 'null' || value === 'undefined'
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type="number"
        value={isEmpty ? '' : value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-right font-mono text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
      />
    </div>
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
