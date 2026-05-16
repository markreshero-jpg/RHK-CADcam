'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import { DEFAULT_DIMS } from '@/src/lib/types'
import { DEFAULT_CONSTRUCTION_METHOD } from '@/src/lib/defaults/constructionMethod'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShopSettings {
  id: string
  company_name: string | null
  company_address: string | null
  company_abn: string | null
  company_phone: string | null
  company_email: string | null
  company_website: string | null
  default_rule_overrides: Record<string, unknown>
  default_base_dy: number
  default_base_dz: number
  default_wall_dy: number
  default_wall_dz: number
  default_tall_dy: number
  default_tall_dz: number
  assembly_schedule_id: string | null
  toekick_schedule_id: string | null
  front_schedule_id: string | null
  drawerbox_schedule_id: string | null
  inner_drawerbox_schedule_id: string | null
  hinge_schedule_id: string | null
  slide_schedule_id: string | null
  handle_schedule_id: string | null
  benchtop_schedule_id: string | null
}

export type SchedKey =
  | 'assembly' | 'toekick' | 'front' | 'drawerbox'
  | 'inner_drawerbox' | 'hinge' | 'slide' | 'handle' | 'benchtop'

export type SchedListMap = Record<SchedKey, { id: string; name: string }[]>

// ── Construction rules ────────────────────────────────────────────────────────

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

// ── Schedule config ───────────────────────────────────────────────────────────

const SCHED_TYPES: { key: SchedKey; label: string; col: keyof ShopSettings }[] = [
  { key: 'assembly',        label: 'Assembly',             col: 'assembly_schedule_id'        },
  { key: 'toekick',         label: 'Toe Kick',             col: 'toekick_schedule_id'         },
  { key: 'front',           label: 'Door & Drawer Fronts', col: 'front_schedule_id'           },
  { key: 'drawerbox',       label: 'Drawer Box',           col: 'drawerbox_schedule_id'       },
  { key: 'inner_drawerbox', label: 'Inner Drawer Box',     col: 'inner_drawerbox_schedule_id' },
  { key: 'hinge',           label: 'Hinges',               col: 'hinge_schedule_id'           },
  { key: 'slide',           label: 'Slides',               col: 'slide_schedule_id'           },
  { key: 'handle',          label: 'Handles',              col: 'handle_schedule_id'          },
  { key: 'benchtop',        label: 'Benchtops',            col: 'benchtop_schedule_id'        },
]

// ── Tab config ────────────────────────────────────────────────────────────────

type SettingsTab =
  | 'company' | 'dimensions' | 'construction' | 'materials'
  | 'cabinet_builder' | 'drawer_builder' | 'benchtop_builder'
  | 'cnc_tool' | 'cnc_machine'

interface TabDef {
  id: SettingsTab
  label: string
  group?: string
  icon: React.ReactNode
}

const TABS: TabDef[] = [
  {
    id: 'company', label: 'Company', group: 'Shop',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="4.5" width="12" height="9" rx="0.8"/>
        <path d="M4.5 4.5V3a1 1 0 011-1h4a1 1 0 011 1v1.5"/>
        <line x1="7.5" y1="8" x2="7.5" y2="11"/>
        <line x1="5.5" y1="9.5" x2="9.5" y2="9.5"/>
      </svg>
    ),
  },
  {
    id: 'dimensions', label: 'Dimensions', group: 'Shop',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="2" y1="13" x2="13" y2="13"/>
        <line x1="2" y1="2" x2="2" y2="13"/>
        <polyline points="5,2 2,2 2,5"/>
        <rect x="5" y="5" width="8" height="6" rx="0.6" fill="currentColor" fillOpacity="0.1"/>
      </svg>
    ),
  },
  {
    id: 'construction', label: 'Construction', group: 'Shop',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 13L6.5 8.5M9 3l3 3-1.5 1.5-3-3z"/>
        <path d="M6.5 8.5L5 10l-1.5-1.5L5 7z"/>
        <line x1="9.5" y1="2.5" x2="12.5" y2="5.5"/>
      </svg>
    ),
  },
  {
    id: 'materials', label: 'Materials', group: 'Shop',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="2" width="12" height="2.5" rx="0.5" fill="currentColor" fillOpacity="0.15"/>
        <rect x="1.5" y="6" width="12" height="2.5" rx="0.5" fill="currentColor" fillOpacity="0.15"/>
        <rect x="1.5" y="10" width="12" height="2.5" rx="0.5" fill="currentColor" fillOpacity="0.15"/>
        <rect x="1.5" y="2" width="12" height="2.5" rx="0.5"/>
        <rect x="1.5" y="6" width="12" height="2.5" rx="0.5"/>
        <rect x="1.5" y="10" width="12" height="2.5" rx="0.5"/>
      </svg>
    ),
  },
  {
    id: 'cabinet_builder', label: 'Cabinet Builder', group: 'Builders',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="1.5" width="12" height="12" rx="1" fill="currentColor" fillOpacity="0.08"/>
        <rect x="1.5" y="1.5" width="12" height="12" rx="1"/>
        <line x1="7.5" y1="1.5" x2="7.5" y2="13.5"/>
        <line x1="1.5" y1="7.5" x2="13.5" y2="7.5"/>
        <circle cx="5.25" cy="4.75" r="0.75" fill="currentColor" stroke="none"/>
        <circle cx="10.25" cy="4.75" r="0.75" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    id: 'drawer_builder', label: 'Drawer Builder', group: 'Builders',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="4" width="12" height="7" rx="0.8" fill="currentColor" fillOpacity="0.08"/>
        <rect x="1.5" y="4" width="12" height="7" rx="0.8"/>
        <line x1="1.5" y1="7.5" x2="13.5" y2="7.5" strokeOpacity="0.5"/>
        <rect x="5.5" y="6" width="4" height="3" rx="0.5"/>
        <line x1="4" y1="2" x2="4" y2="4"/>
        <line x1="11" y1="2" x2="11" y2="4"/>
      </svg>
    ),
  },
  {
    id: 'benchtop_builder', label: 'Benchtop Builder', group: 'Builders',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="5" width="13" height="3" rx="0.6" fill="currentColor" fillOpacity="0.15"/>
        <rect x="1" y="5" width="13" height="3" rx="0.6"/>
        <line x1="3" y1="8" x2="3" y2="13"/>
        <line x1="12" y1="8" x2="12" y2="13"/>
        <line x1="2" y1="13" x2="13" y2="13"/>
      </svg>
    ),
  },
  {
    id: 'cnc_tool', label: 'CNC Tool Setup', group: 'CNC',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="7.5" y1="1.5" x2="7.5" y2="9"/>
        <path d="M5.5 9 L5 12.5 L7.5 13.5 L10 12.5 L9.5 9 Z"/>
        <line x1="5.5" y1="9" x2="9.5" y2="9"/>
        <line x1="5" y1="3" x2="10" y2="3" strokeOpacity="0.5"/>
        <line x1="5.5" y1="5" x2="9.5" y2="5" strokeOpacity="0.5"/>
      </svg>
    ),
  },
  {
    id: 'cnc_machine', label: 'CNC Machine Setup', group: 'CNC',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="4" width="12" height="8" rx="1" fill="currentColor" fillOpacity="0.08"/>
        <rect x="1.5" y="4" width="12" height="8" rx="1"/>
        <circle cx="7.5" cy="8" r="2"/>
        <line x1="7.5" y1="1.5" x2="7.5" y2="4"/>
        <line x1="3" y1="4" x2="3" y2="2.5"/>
        <line x1="12" y1="4" x2="12" y2="2.5"/>
        <line x1="2.5" y1="2.5" x2="12.5" y2="2.5"/>
      </svg>
    ),
  },
]

const GROUPS = ['Shop', 'Builders', 'CNC'] as const

// ── Empty defaults ────────────────────────────────────────────────────────────

const EMPTY_SETTINGS: ShopSettings = {
  id: '',
  company_name: null, company_address: null, company_abn: null,
  company_phone: null, company_email: null, company_website: null,
  default_rule_overrides: {},
  default_base_dy: DEFAULT_DIMS.base.dy, default_base_dz: DEFAULT_DIMS.base.dz,
  default_wall_dy: DEFAULT_DIMS.wall.dy, default_wall_dz: DEFAULT_DIMS.wall.dz,
  default_tall_dy: DEFAULT_DIMS.tall.dy, default_tall_dz: DEFAULT_DIMS.tall.dz,
  assembly_schedule_id: null, toekick_schedule_id: null, front_schedule_id: null,
  drawerbox_schedule_id: null, inner_drawerbox_schedule_id: null,
  hinge_schedule_id: null, slide_schedule_id: null,
  handle_schedule_id: null, benchtop_schedule_id: null,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsClient({ settings: initSettings, schedLists }: {
  settings: ShopSettings | null
  schedLists: SchedListMap
}) {
  const s = initSettings ?? EMPTY_SETTINGS
  const [tab, setTab] = useState<SettingsTab>('company')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Company
  const [companyName,    setCompanyName]    = useState(s.company_name    ?? '')
  const [companyAddress, setCompanyAddress] = useState(s.company_address ?? '')
  const [companyAbn,     setCompanyAbn]     = useState(s.company_abn     ?? '')
  const [companyPhone,   setCompanyPhone]   = useState(s.company_phone   ?? '')
  const [companyEmail,   setCompanyEmail]   = useState(s.company_email   ?? '')
  const [companyWebsite, setCompanyWebsite] = useState(s.company_website ?? '')

  // Dimensions
  const [baseDy, setBaseDy] = useState(s.default_base_dy)
  const [baseDz, setBaseDz] = useState(s.default_base_dz)
  const [wallDy, setWallDy] = useState(s.default_wall_dy)
  const [wallDz, setWallDz] = useState(s.default_wall_dz)
  const [tallDy, setTallDy] = useState(s.default_tall_dy)
  const [tallDz, setTallDz] = useState(s.default_tall_dz)

  // Construction
  const [rules, setRules] = useState<Rules>({
    ...SYS,
    ...(s.default_rule_overrides as Partial<Rules>),
  })

  function setRule<K extends RuleKey>(key: K, value: Rules[K]) {
    setRules(prev => ({ ...prev, [key]: value }))
  }

  const overrideCount = (Object.keys(SYS) as RuleKey[]).filter(k => rules[k] !== SYS[k]).length

  // Materials (schedule IDs) — save immediately on change
  const [schedIds, setSchedIds] = useState<Partial<Record<string, string | null>>>(() => {
    const m: Record<string, string | null> = {}
    for (const st of SCHED_TYPES) m[st.col] = (s[st.col] as string | null) ?? null
    return m
  })

  async function handleSaveSchedule(col: string, id: string | null) {
    if (!s.id) return
    const { error } = await supabase.from('shop_settings').update({ [col]: id || null }).eq('id', s.id)
    if (!error) setSchedIds(p => ({ ...p, [col]: id }))
    else console.error('schedule save error:', error)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const newOverrides: Partial<Rules> = {}
      for (const k of Object.keys(SYS) as RuleKey[]) {
        if (rules[k] !== SYS[k]) (newOverrides as Record<string, unknown>)[k] = rules[k]
      }
      const payload = {
        company_name:           companyName.trim()    || null,
        company_address:        companyAddress.trim() || null,
        company_abn:            companyAbn.trim()     || null,
        company_phone:          companyPhone.trim()   || null,
        company_email:          companyEmail.trim()   || null,
        company_website:        companyWebsite.trim() || null,
        default_rule_overrides: newOverrides as Record<string, unknown>,
        default_base_dy: baseDy, default_base_dz: baseDz,
        default_wall_dy: wallDy, default_wall_dz: wallDz,
        default_tall_dy: tallDy, default_tall_dz: tallDz,
      }
      if (s.id) {
        await supabase.from('shop_settings').update(payload).eq('id', s.id)
      } else {
        await supabase.from('shop_settings').insert(payload)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const hasSaveFooter = ['company', 'dimensions', 'construction'].includes(tab)

  const activeTabDef = TABS.find(t => t.id === tab)!

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-none border-b border-gray-800 px-6 py-3 flex items-center gap-3">
        <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">← Projects</Link>
        <span className="text-gray-700">|</span>
        <span className="text-sm font-semibold text-white">Settings</span>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar nav */}
        <aside className="w-52 flex-none border-r border-gray-800 overflow-y-auto py-3">
          {GROUPS.map(group => (
            <div key={group} className="mb-1">
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">{group}</p>
              {TABS.filter(t => t.group === group).map(t => {
                const isActive = tab === t.id
                const badge = t.id === 'construction' && overrideCount > 0 ? overrideCount : null
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs transition-colors ${
                      isActive
                        ? 'bg-blue-600/15 text-blue-300'
                        : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                    }`}
                  >
                    <span className={isActive ? 'text-blue-400' : 'text-gray-500'}>
                      {t.icon}
                    </span>
                    <span className="flex-1 text-left">{t.label}</span>
                    {badge && (
                      <span className="text-[10px] bg-blue-600/40 text-blue-300 px-1.5 py-0.5 rounded-full leading-none">
                        {badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </aside>

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6 max-w-3xl">

            {/* Section heading */}
            <div className="flex items-center gap-2.5 mb-6">
              <span className="text-gray-400">{activeTabDef.icon}</span>
              <h2 className="text-sm font-semibold text-white">{activeTabDef.label}</h2>
            </div>

            {/* ── Company ── */}
            {tab === 'company' && (
              <div className="space-y-4 max-w-md">
                <Field label="Company Name">
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)}
                    placeholder="RHK Cabinets"
                    className={INP} />
                </Field>
                <Field label="ABN">
                  <input value={companyAbn} onChange={e => setCompanyAbn(e.target.value)}
                    placeholder="12 345 678 901"
                    className={INP} />
                </Field>
                <Field label="Address">
                  <textarea value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} rows={3}
                    placeholder="123 Example St, Melbourne VIC 3000"
                    className={`${INP} resize-none`} />
                </Field>
                <Field label="Phone">
                  <input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)}
                    placeholder="03 9999 9999"
                    className={INP} />
                </Field>
                <Field label="Email">
                  <input value={companyEmail} onChange={e => setCompanyEmail(e.target.value)}
                    type="email" placeholder="info@example.com"
                    className={INP} />
                </Field>
                <Field label="Website">
                  <input value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)}
                    placeholder="https://example.com"
                    className={INP} />
                </Field>
              </div>
            )}

            {/* ── Dimensions ── */}
            {tab === 'dimensions' && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">
                  Shop-wide defaults applied when placing new cabinets. Can be overridden per-job or per-cabinet.
                </p>
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
                <p className="text-xs text-gray-600">Blue = overrides system default</p>
              </div>
            )}

            {/* ── Construction ── */}
            {tab === 'construction' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg text-xs">
                  <span className="text-gray-400">Method</span>
                  <span className="text-white font-medium">{DEFAULT_CONSTRUCTION_METHOD.name}</span>
                  <span className="text-gray-600 ml-auto">Override per-job or per-cabinet</span>
                </div>
                {RULE_GROUPS.map(group => (
                  <div key={group.label}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group.label}</p>
                    <div className="space-y-px">
                      {group.keys.map(k => (
                        <RuleRow key={k} ruleKey={k} value={rules[k]} baseline={SYS[k]}
                          onChange={v => setRule(k, v as Rules[typeof k])} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Materials ── */}
            {tab === 'materials' && (
              <div className="space-y-6">
                <div>
                  <p className="text-xs text-gray-500 mb-4">Applied to new jobs unless overridden at job or room level. Changes save immediately.</p>
                  <div className="border border-gray-700 rounded overflow-hidden divide-y divide-gray-700/60">
                    {SCHED_TYPES.map(st => {
                      const val = schedIds[st.col] ?? ''
                      return (
                        <div key={st.key} className="flex items-center gap-4 px-4 py-3 bg-gray-900">
                          <div className="w-48 shrink-0 text-xs font-medium text-gray-200">{st.label}</div>
                          <select
                            value={val ?? ''}
                            onChange={e => handleSaveSchedule(st.col, e.target.value || null)}
                            className="flex-1 max-w-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="">— not set —</option>
                            {(schedLists[st.key] ?? []).map(sc => (
                              <option key={sc.id} value={sc.id}>{sc.name}</option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-800">
                  <p className="text-xs text-gray-500 mb-2">Per-class material defaults (carcass, doors, shelves, etc.) are set in the Materials Library.</p>
                  <Link href="/library/schedules" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                    Materials Library → Shop Defaults →
                  </Link>
                </div>
              </div>
            )}

            {/* ── Placeholder tabs ── */}
            {['cabinet_builder', 'drawer_builder', 'benchtop_builder', 'cnc_tool', 'cnc_machine'].includes(tab) && (
              <ComingSoon label={activeTabDef.label} />
            )}

          </div>

          {/* Footer */}
          {hasSaveFooter && (
            <div className="flex-none border-t border-gray-800 px-8 py-3 flex items-center justify-end gap-3">
              {saved && <span className="text-xs text-green-400">Saved</span>}
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

const INP = 'w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

function NumInput({ value, onChange, baseline }: {
  value: number
  onChange: (v: number) => void
  baseline: number
}) {
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

function RuleRow({ ruleKey, value, baseline, onChange }: {
  ruleKey: RuleKey
  value: Rules[RuleKey]
  baseline: Rules[RuleKey]
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
          {isOverridden && <span className="text-gray-600 text-[10px]">system: {String(baseline)}</span>}
          <select value={value as string} onChange={e => onChange(e.target.value as Rules[RuleKey])} className={inputCls}>
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
          {isOverridden && <span className="text-gray-600 text-[10px]">system: {String(baseline)}</span>}
          <select value={value as string} onChange={e => onChange(e.target.value as Rules[RuleKey])} className={inputCls}>
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
        {isOverridden && <span className="text-gray-600 text-[10px]">system: {String(baseline)}</span>}
        <input type="number" value={value as number}
          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onChange(v as Rules[RuleKey]) }}
          className={`w-20 text-right ${inputCls}`}
        />
      </div>
    </div>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <div className="w-10 h-10 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-600">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="9" r="7"/>
          <line x1="9" y1="5" x2="9" y2="9.5"/>
          <circle cx="9" cy="12.5" r="0.75" fill="currentColor" stroke="none"/>
        </svg>
      </div>
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      <p className="text-xs text-gray-600 max-w-xs">Configuration for this section will be added as the feature is built out.</p>
    </div>
  )
}
