'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import MaterialsClient from '@/app/library/materials/MaterialsClient'
import SchedulesClient from '@/app/library/schedules/SchedulesClient'
import ConstructionMethodsClient from '@/app/library/construction-methods/ConstructionMethodsClient'
import DrawerBoxesClient from '@/app/library/drawer-boxes/DrawerBoxesClient'
import JointsClient from '@/app/library/joints/JointsClient'
import PartsLibraryClient from '@/app/library/parts/PartsLibraryClient'
import DoorSystemClient from '@/app/library/doors/DoorSystemClient'
import CabinetsLibraryClient from '@/app/library/cabinets/CabinetsLibraryClient'
import HingeCountRulesEditor from '@/app/settings/HingeCountRulesEditor'
import CncToolsClient from '@/app/settings/CncToolsClient'
import DrillLibraryClient from '@/app/settings/DrillLibraryClient'
import CncToolSetsClient from '@/app/settings/CncToolSetsClient'
import CncMachinesClient from '@/app/settings/CncMachinesClient'
import { DEFAULT_DIMS } from '@/src/lib/types'
import { getUserPrefs, setUserPrefs, type DrawingPreset, type DrawingPresets, type CabinetViewStyles, type ViewStyle } from '@/src/lib/userPrefs'
import { DISPLAY_PRESETS } from '@/src/lib/displayConfig'
import {
  getPalette, setUserPaletteOverride, DEFAULT_PALETTE,
  PALETTE_CATEGORY_ORDER, PALETTE_CATEGORY_LABELS,
  type PartPalette, type PaletteCategory,
} from '@/src/lib/partPalette'
import { ThemeToggle } from '../ThemeToggle'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShopSettings {
  id: string
  company_name: string | null
  company_address: string | null
  company_abn: string | null
  company_phone: string | null
  company_email: string | null
  company_website: string | null
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
  construction_schedule_id: string | null
}

export type SchedKey =
  | 'assembly' | 'toekick' | 'front' | 'drawerbox'
  | 'inner_drawerbox' | 'hinge' | 'slide' | 'handle' | 'benchtop'

export type SchedListMap = Record<SchedKey, { id: string; name: string }[]>

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
  | 'user_preferences'
  | 'company' | 'dimensions' | 'materials'
  | 'cabinet_builder' | 'drawer_builder' | 'benchtop_builder'
  | 'hinge_rules'
  | 'cnc_tool' | 'drill_library' | 'cnc_tool_set' | 'cnc_machine'
  | 'materials_library' | 'materials_schedule' | 'joints_library' | 'parts_library' | 'doors_library' | 'cabinets_library'

interface TabDef {
  id: SettingsTab
  label: string
  group?: string
  icon: React.ReactNode
}

const TABS: TabDef[] = [
  {
    id: 'user_preferences', label: 'Preferences', group: 'User',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7.5" cy="5" r="2.5"/>
        <path d="M2 13c0-2.76 2.46-5 5.5-5s5.5 2.24 5.5 5"/>
      </svg>
    ),
  },
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
    id: 'hinge_rules', label: 'Hinge Rules', group: 'Builders',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="7.5" y1="1.5" x2="7.5" y2="13.5"/>
        <rect x="3" y="1.5" width="4.5" height="12" rx="0.8" fill="currentColor" fillOpacity="0.08"/>
        <rect x="7.5" y="1.5" width="4.5" height="12" rx="0.8" fill="currentColor" fillOpacity="0.08"/>
        <circle cx="7.5" cy="4" r="0.7" fill="currentColor" stroke="none"/>
        <circle cx="7.5" cy="7.5" r="0.7" fill="currentColor" stroke="none"/>
        <circle cx="7.5" cy="11" r="0.7" fill="currentColor" stroke="none"/>
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
    id: 'drill_library', label: 'Drill Library', group: 'CNC',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="7.5" y1="1.5" x2="7.5" y2="10"/>
        <path d="M6 10 L7.5 13.5 L9 10 Z" fill="currentColor" fillOpacity="0.15"/>
        <line x1="6" y1="4" x2="9" y2="4" strokeOpacity="0.5"/>
        <line x1="6" y1="6.5" x2="9" y2="6.5" strokeOpacity="0.5"/>
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
  {
    id: 'cnc_tool_set', label: 'Tool Sets', group: 'CNC',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="2" y1="3.5" x2="13" y2="3.5"/>
        <line x1="2" y1="7.5" x2="13" y2="7.5"/>
        <line x1="2" y1="11.5" x2="13" y2="11.5"/>
        <circle cx="4.5" cy="3.5" r="1.2" fill="currentColor" stroke="none"/>
        <circle cx="9" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>
        <circle cx="6" cy="11.5" r="1.2" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    id: 'materials_library', label: 'Materials Library', group: 'Library',
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
    id: 'materials_schedule', label: 'Materials Schedule', group: 'Library',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="1.5" width="12" height="12" rx="1"/>
        <line x1="1.5" y1="5.5" x2="13.5" y2="5.5"/>
        <line x1="6" y1="5.5" x2="6" y2="13.5"/>
      </svg>
    ),
  },
  {
    id: 'joints_library', label: 'Joints Library', group: 'Library',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="6" width="5" height="3" rx="0.5"/>
        <rect x="9" y="6" width="5" height="3" rx="0.5"/>
        <line x1="6" y1="7.5" x2="9" y2="7.5"/>
        <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" fillOpacity="0.3"/>
        <circle cx="7.5" cy="7.5" r="1.2"/>
      </svg>
    ),
  },
  {
    id: 'parts_library', label: 'Parts Library', group: 'Library',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="1.5" width="5" height="5" rx="0.6"/>
        <rect x="8.5" y="1.5" width="5" height="5" rx="0.6"/>
        <rect x="1.5" y="8.5" width="5" height="5" rx="0.6"/>
        <rect x="8.5" y="8.5" width="5" height="5" rx="0.6"/>
      </svg>
    ),
  },
  {
    id: 'doors_library', label: 'Doors Library', group: 'Library',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="1.5" width="9" height="12" rx="0.8"/>
        <line x1="3" y1="4" x2="12" y2="4"/>
        <line x1="3" y1="11" x2="12" y2="11"/>
        <circle cx="9.8" cy="7.5" r="0.7" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: 'cabinets_library', label: 'Cabinets Library', group: 'Library',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="2" width="12" height="11" rx="0.8"/>
        <line x1="7.5" y1="2" x2="7.5" y2="13"/>
        <line x1="5" y1="7.5" x2="6" y2="7.5" strokeWidth="1.8"/>
        <line x1="9" y1="7.5" x2="10" y2="7.5" strokeWidth="1.8"/>
      </svg>
    ),
  },
]

const GROUPS = ['User', 'Shop', 'Builders', 'CNC', 'Library'] as const

// ── Empty defaults ────────────────────────────────────────────────────────────

const EMPTY_SETTINGS: ShopSettings = {
  id: '',
  company_name: null, company_address: null, company_abn: null,
  company_phone: null, company_email: null, company_website: null,
  default_base_dy: DEFAULT_DIMS.base.dy, default_base_dz: DEFAULT_DIMS.base.dz,
  default_wall_dy: DEFAULT_DIMS.wall.dy, default_wall_dz: DEFAULT_DIMS.wall.dz,
  default_tall_dy: DEFAULT_DIMS.tall.dy, default_tall_dz: DEFAULT_DIMS.tall.dz,
  assembly_schedule_id: null, toekick_schedule_id: null, front_schedule_id: null,
  drawerbox_schedule_id: null, inner_drawerbox_schedule_id: null,
  hinge_schedule_id: null, slide_schedule_id: null,
  handle_schedule_id: null, benchtop_schedule_id: null,
  construction_schedule_id: null,
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

  // User preferences (localStorage)
  const [invertScroll, setInvertScroll] = useState(false)
  const [includeBanding, setIncludeBanding] = useState(true)
  const [drawingPresets, setDrawingPresets] = useState<DrawingPresets>({ plan: 'full_parts', elevation: 'full_parts' })
  const [cabinetViewStyles, setCabinetViewStyles] = useState<CabinetViewStyles>({ top: 'wire', elevation: 'wire', side: 'wire', '3d': 'wire' })
  const [palette, setPalette] = useState<PartPalette>(DEFAULT_PALETTE)
  useEffect(() => {
    const prefs = getUserPrefs()
    setInvertScroll(prefs.invertScroll)
    setIncludeBanding(prefs.includeBandingInPartSize)
    setDrawingPresets(prefs.drawingPresets)
    setCabinetViewStyles(prefs.cabinetViewStyles)
    setPalette(getPalette())
  }, [])

  function handlePaletteColor(cat: PaletteCategory, val: string) {
    const next = { ...palette, [cat]: val }
    setPalette(next)
    setUserPaletteOverride(next)
  }
  function resetPaletteColor(cat: PaletteCategory) {
    handlePaletteColor(cat, DEFAULT_PALETTE[cat])
  }
  function resetAllPalette() {
    setPalette(DEFAULT_PALETTE)
    setUserPaletteOverride({})
  }

  function toggleInvertScroll(val: boolean) {
    setInvertScroll(val)
    setUserPrefs({ invertScroll: val })
  }

  function toggleIncludeBanding(val: boolean) {
    setIncludeBanding(val)
    setUserPrefs({ includeBandingInPartSize: val })
  }

  function handleDrawingPreset(view: keyof DrawingPresets, val: DrawingPreset) {
    const next = { ...drawingPresets, [view]: val }
    setDrawingPresets(next)
    setUserPrefs({ drawingPresets: next })
  }

  function handleCabinetViewStyle(view: keyof CabinetViewStyles, val: ViewStyle) {
    const next = { ...cabinetViewStyles, [view]: val }
    setCabinetViewStyles(next)
    setUserPrefs({ cabinetViewStyles: next })
  }

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
      const payload = {
        company_name:    companyName.trim()    || null,
        company_address: companyAddress.trim() || null,
        company_abn:     companyAbn.trim()     || null,
        company_phone:   companyPhone.trim()   || null,
        company_email:   companyEmail.trim()   || null,
        company_website: companyWebsite.trim() || null,
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

  const hasSaveFooter = ['company', 'dimensions'].includes(tab)

  const activeTabDef = TABS.find(t => t.id === tab)!

  return (
    <div className="h-screen bg-canvas text-ink flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-3">
        <ThemeToggle />
        <Link href="/" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">← Projects</Link>
        <span className="text-ink-subtle">|</span>
        <span className="text-sm font-semibold text-ink">Settings</span>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar nav */}
        <aside className="w-52 flex-none border-r border-edge overflow-y-auto py-3">
          {GROUPS.map(group => (
            <div key={group} className="mb-1">
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">{group}</p>
              {TABS.filter(t => t.group === group).map(t => {
                const isActive = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs transition-colors ${
                      isActive
                        ? 'bg-accent/15 text-accent-ink'
                        : 'text-ink-muted hover:bg-surface-2/60 hover:text-ink'
                    }`}
                  >
                    <span className={isActive ? 'text-accent-ink' : 'text-ink-subtle'}>
                      {t.icon}
                    </span>
                    <span className="flex-1 text-left">{t.label}</span>
                  </button>
                )
              })}
            </div>
          ))}

        </aside>

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {tab === 'materials_library' ? (
            <MaterialsClient embedded />
          ) : tab === 'materials_schedule' ? (
            <SchedulesClient embedded />
          ) : tab === 'joints_library' ? (
            <JointsClient embedded />
          ) : tab === 'parts_library' ? (
            <PartsLibraryClient embedded />
          ) : tab === 'doors_library' ? (
            <DoorSystemClient embedded />
          ) : tab === 'cabinets_library' ? (
            <CabinetsLibraryClient embedded />
          ) : tab === 'cabinet_builder' ? (
            <ConstructionMethodsClient embedded />
          ) : tab === 'drawer_builder' ? (
            <DrawerBoxesClient embedded />
          ) : tab === 'hinge_rules' ? (
            <HingeCountRulesEditor embedded />
          ) : tab === 'cnc_tool' ? (
            <CncToolsClient />
          ) : tab === 'drill_library' ? (
            <DrillLibraryClient />
          ) : tab === 'cnc_tool_set' ? (
            <CncToolSetsClient />
          ) : tab === 'cnc_machine' ? (
            <CncMachinesClient />
          ) : (<>
          <div className="flex-1 overflow-y-auto px-8 py-6 max-w-3xl">

            {/* Section heading */}
            <div className="flex items-center gap-2.5 mb-6">
              <span className="text-ink-muted">{activeTabDef.icon}</span>
              <h2 className="text-sm font-semibold text-ink">{activeTabDef.label}</h2>
            </div>

            {/* ── User Preferences ── */}
            {tab === 'user_preferences' && (
              <div className="space-y-6 max-w-md">
                <p className="text-xs text-ink-subtle">
                  Personal preferences stored locally in your browser. These apply to your account on this device only.
                </p>

                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">Viewport Controls</p>
                  <div className="border border-edge-strong rounded-lg overflow-hidden divide-y divide-edge-strong/60">
                    <div className="flex items-center justify-between px-4 py-3 bg-surface">
                      <div>
                        <p className="text-xs font-medium text-ink">Reverse scroll wheel zoom</p>
                        <p className="text-[11px] text-ink-subtle mt-0.5">Applies to plan, elevation, and 3D views</p>
                      </div>
                      <button
                        onClick={() => toggleInvertScroll(!invertScroll)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                          invertScroll ? 'bg-accent' : 'bg-surface-3'
                        }`}
                        role="switch"
                        aria-checked={invertScroll}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          invertScroll ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 bg-surface">
                      <div>
                        <p className="text-xs font-medium text-ink">Include edge banding in overall part size</p>
                        <p className="text-[11px] text-ink-subtle mt-0.5">Part dimensions in the cabinet editor show the finished size (with tape). Off = cut (board) size</p>
                      </div>
                      <button
                        onClick={() => toggleIncludeBanding(!includeBanding)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                          includeBanding ? 'bg-accent' : 'bg-surface-3'
                        }`}
                        role="switch"
                        aria-checked={includeBanding}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          includeBanding ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">Default Drawing Layer</p>
                  <div className="border border-edge-strong rounded-lg overflow-hidden divide-y divide-edge-strong/60">
                    {([
                      { view: 'plan' as const,      label: 'Plan view',      hint: 'Starting detail level in the plan canvas' },
                      { view: 'elevation' as const, label: 'Elevation view', hint: 'Starting detail level in the elevation canvas' },
                    ]).map(row => (
                      <div key={row.view} className="flex items-center justify-between px-4 py-3 bg-surface">
                        <div>
                          <p className="text-xs font-medium text-ink">{row.label}</p>
                          <p className="text-[11px] text-ink-subtle mt-0.5">{row.hint}</p>
                        </div>
                        <select
                          value={drawingPresets[row.view]}
                          onChange={e => handleDrawingPreset(row.view, e.target.value as DrawingPreset)}
                          className="bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent"
                        >
                          {(Object.entries(DISPLAY_PRESETS) as [DrawingPreset, { label: string }][]).map(([id, { label }]) => (
                            <option key={id} value={id}>{label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">Cabinet View Style</p>
                  <p className="text-[11px] text-ink-subtle mb-3">Default wire / solid rendering for each view in the cabinet editor.</p>
                  <div className="border border-edge-strong rounded-lg overflow-hidden divide-y divide-edge-strong/60">
                    {([
                      { view: 'top' as const,       label: 'Top' },
                      { view: 'elevation' as const, label: 'Elevation' },
                      { view: 'side' as const,      label: 'Side' },
                      { view: '3d' as const,        label: '3D' },
                    ]).map(row => (
                      <div key={row.view} className="flex items-center justify-between px-4 py-3 bg-surface">
                        <p className="text-xs font-medium text-ink">{row.label}</p>
                        <div className="inline-flex rounded-md border border-edge-strong overflow-hidden">
                          {(['wire', 'solid'] as ViewStyle[]).map(style => {
                            const active = cabinetViewStyles[row.view] === style
                            return (
                              <button
                                key={style}
                                onClick={() => handleCabinetViewStyle(row.view, style)}
                                className={`px-3 py-1 text-xs capitalize transition-colors ${
                                  active ? 'bg-accent text-white' : 'bg-surface-2 text-ink-muted hover:text-ink'
                                }`}
                              >
                                {style}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Part Line Colours</p>
                    <button
                      onClick={resetAllPalette}
                      className="text-[11px] text-ink-subtle hover:text-ink transition-colors"
                    >
                      Reset all
                    </button>
                  </div>
                  <p className="text-[11px] text-ink-subtle mb-3">
                    Colour for each part type&apos;s lines in the plan, elevation, and 3D views.
                  </p>
                  <div className="border border-edge-strong rounded-lg overflow-hidden divide-y divide-edge-strong/60">
                    {PALETTE_CATEGORY_ORDER.map(cat => {
                      const isDefault = palette[cat].toLowerCase() === DEFAULT_PALETTE[cat].toLowerCase()
                      return (
                        <div key={cat} className="flex items-center justify-between px-4 py-2.5 bg-surface">
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={palette[cat]}
                              onChange={e => handlePaletteColor(cat, e.target.value)}
                              className="h-6 w-9 rounded border border-edge-strong bg-surface-2 cursor-pointer p-0"
                              title={`${PALETTE_CATEGORY_LABELS[cat]} colour`}
                            />
                            <span className="text-xs font-medium text-ink">{PALETTE_CATEGORY_LABELS[cat]}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-ink-subtle uppercase">{palette[cat]}</span>
                            {!isDefault && (
                              <button
                                onClick={() => resetPaletteColor(cat)}
                                className="text-[11px] text-ink-subtle hover:text-ink transition-colors"
                                title="Reset to default"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

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
                <p className="text-xs text-ink-subtle">
                  Shop-wide defaults applied when placing new cabinets. Can be overridden per-job or per-cabinet.
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-ink-subtle text-left">
                      <th className="pb-3 font-medium">Cabinet Class</th>
                      <th className="pb-3 font-medium text-right pr-6">Height dy (mm)</th>
                      <th className="pb-3 font-medium text-right">Depth dz (mm)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {[
                      { label: 'Base', dy: baseDy, dz: baseDz, setDy: setBaseDy, setDz: setBaseDz, sysDy: DEFAULT_DIMS.base.dy, sysDz: DEFAULT_DIMS.base.dz },
                      { label: 'Wall', dy: wallDy, dz: wallDz, setDy: setWallDy, setDz: setWallDz, sysDy: DEFAULT_DIMS.wall.dy, sysDz: DEFAULT_DIMS.wall.dz },
                      { label: 'Tall', dy: tallDy, dz: tallDz, setDy: setTallDy, setDz: setTallDz, sysDy: DEFAULT_DIMS.tall.dy, sysDz: DEFAULT_DIMS.tall.dz },
                    ].map(row => (
                      <tr key={row.label}>
                        <td className="py-3 text-ink-muted font-medium">{row.label}</td>
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
                <p className="text-xs text-ink-subtle">Blue = overrides system default</p>
              </div>
            )}

            {/* ── Materials ── */}
            {tab === 'materials' && (
              <div className="space-y-6">
                <div>
                  <p className="text-xs text-ink-subtle mb-4">Applied to new jobs unless overridden at job or room level. Changes save immediately.</p>
                  <div className="border border-edge-strong rounded overflow-hidden divide-y divide-edge-strong/60">
                    {SCHED_TYPES.map(st => {
                      const val = schedIds[st.col] ?? ''
                      return (
                        <div key={st.key} className="flex items-center gap-4 px-4 py-3 bg-surface">
                          <div className="w-48 shrink-0 text-xs font-medium text-ink">{st.label}</div>
                          <select
                            value={val ?? ''}
                            onChange={e => handleSaveSchedule(st.col, e.target.value || null)}
                            className="flex-1 max-w-xs bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent"
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
                <div className="pt-2 border-t border-edge">
                  <p className="text-xs text-ink-subtle mb-2">Per-class material defaults (carcass, doors, shelves, etc.) are set in the Materials Library.</p>
                  <Link href="/library/schedules" className="text-xs text-accent-ink hover:text-accent-ink transition-colors">
                    Materials Library → Shop Defaults →
                  </Link>
                </div>
              </div>
            )}

            {/* ── Placeholder tabs ── */}
            {['benchtop_builder'].includes(tab) && (
              <ComingSoon label={activeTabDef.label} />
            )}

          </div>

          {/* Footer */}
          {hasSaveFooter && (
            <div className="flex-none border-t border-edge px-8 py-3 flex items-center justify-end gap-3">
              {saved && <span className="text-xs text-green-400">Saved</span>}
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </>)}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

const INP = 'w-full bg-surface-2 border border-edge-strong rounded px-3 py-1.5 text-sm text-ink placeholder-ink-subtle focus:outline-none focus:border-accent'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-ink-muted mb-1">{label}</label>
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
      className={`w-24 bg-surface-2 border rounded px-2 py-1 text-xs text-right font-mono focus:outline-none focus:border-accent ${
        isOverridden ? 'border-accent text-accent-ink' : 'border-edge-strong text-ink'
      }`}
    />
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <div className="w-10 h-10 rounded-xl bg-surface-2 border border-edge-strong flex items-center justify-center text-ink-subtle">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="9" r="7"/>
          <line x1="9" y1="5" x2="9" y2="9.5"/>
          <circle cx="9" cy="12.5" r="0.75" fill="currentColor" stroke="none"/>
        </svg>
      </div>
      <p className="text-sm text-ink-subtle font-medium">{label}</p>
      <p className="text-xs text-ink-subtle max-w-xs">Configuration for this section will be added as the feature is built out.</p>
    </div>
  )
}
