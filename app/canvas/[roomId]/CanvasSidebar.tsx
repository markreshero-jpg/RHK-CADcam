'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/src/lib/supabase'
import { Mode, CabinetInstance, isBenchtopMode } from './canvasTypes'
import { Room, CabinetDefinition, type FixtureCatalogItem, type FixtureGroup } from '@/src/lib/types'
import CategoryIcon from '@/src/components/FixtureIcon'
import RoomSwitcher, { type RoomSwitcherHandle } from './RoomSwitcher'
import type { MatColours, EbByMatId } from './useMaterialColours'
import type { MatColMap } from '@/src/components/three/PartViewer'
import { confirmDelete } from '@/src/components/ConfirmDeleteModal'
import { searchTokens, scoreDef } from '@/src/lib/cabinetSearch'
import { useIsAdmin } from '@/src/lib/useRole'

const CabinetPreview3D = dynamic(() => import('./CabinetPreview3D'), { ssr: false })
const FixturePreview3D = dynamic(() => import('./FixturePreview3D'), { ssr: false })

// ── Icons ─────────────────────────────────────────────────────────────────────

const SelectIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 2.5 L4.5 15 L8 11.5 L10.5 17 L12.5 16 L10 10.5 L15 10.5 Z" fill="currentColor" fillOpacity="0.2"/>
  </svg>
)

const WallIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4.5 L3 16.5 L9 16.5 L9 11 L17 11 L17 4.5 Z" fill="currentColor" fillOpacity="0.2"/>
    <line x1="3" y1="11" x2="9" y2="11" strokeWidth="1"/>
  </svg>
)

const IslandIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <rect x="2" y="7.5" width="16" height="5" rx="1.5" fill="currentColor" fillOpacity="0.15"/>
  </svg>
)

const CabinetIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2.5" width="16" height="15" rx="1.2" fill="currentColor" fillOpacity="0.1"/>
    <line x1="10" y1="2.5" x2="10" y2="17.5"/>
    <rect x="3.5" y="4.5" width="5" height="8.5" rx="0.6" strokeWidth="1.1"/>
    <rect x="11.5" y="4.5" width="5" height="8.5" rx="0.6" strokeWidth="1.1"/>
    <line x1="5.2" y1="9" x2="7" y2="9" strokeWidth="2" strokeLinecap="round"/>
    <line x1="13" y1="9" x2="14.8" y2="9" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)

const BenchtopIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6 L10 3 L17 6 L17 14 L10 17 L3 14 Z" fill="currentColor" fillOpacity="0.12"/>
    <path d="M3 6 L10 3 L17 6 L17 14 L10 17 L3 14 Z"/>
  </svg>
)

const PasteIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5.5" y="5" width="10" height="13" rx="1.2"/>
    <path d="M8.5 5 L8.5 3.5 Q8.5 2 10 2 Q11.5 2 11.5 3.5 L11.5 5"/>
    <line x1="8" y1="10" x2="12" y2="10"/>
    <line x1="8" y1="13" x2="12" y2="13"/>
  </svg>
)

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M1.5 4 L1.5 13 L14.5 13 L14.5 5.5 L7.5 5.5 L6 4 Z" fill="currentColor" fillOpacity="0.15"/>
  </svg>
)

// Category tile pictograms, picked by name (Base / Wall / Tall), generic otherwise.
const BaseCatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <rect x="3" y="11" width="24" height="14" rx="1" fill="currentColor" fillOpacity="0.15"/>
    <line x1="3" y1="15.5" x2="27" y2="15.5"/><line x1="15" y1="15.5" x2="15" y2="25"/>
    <line x1="2" y1="11" x2="28" y2="11" strokeWidth="2.2"/>
  </svg>
)
const WallCatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <rect x="4" y="4" width="22" height="12" rx="1" fill="currentColor" fillOpacity="0.15"/>
    <line x1="15" y1="4" x2="15" y2="16"/>
    <line x1="2" y1="27" x2="28" y2="27" strokeOpacity="0.35" strokeDasharray="2 2"/>
  </svg>
)
const TallCatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <rect x="9" y="2.5" width="12" height="25" rx="1" fill="currentColor" fillOpacity="0.15"/>
    <line x1="9" y1="11" x2="21" y2="11"/>
  </svg>
)
function catIconFor(name: string) {
  const n = name.toLowerCase()
  if (n.includes('base')) return <BaseCatIcon />
  if (n.includes('wall') || n.includes('upper')) return <WallCatIcon />
  if (n.includes('tall') || n.includes('pantry')) return <TallCatIcon />
  return <CabinetIcon />
}
// Fallback category colours when accent_color is unset (by top-level order).
const CAT_PALETTE = ['#60a5fa', '#34d399', '#a78bfa', '#fbbf24', '#f472b6', '#22d3ee']

// ── Sidebar section primitives ─────────────────────────────────────────────────
// Every tool section (Wall F2, Cabinet F3, Benchtop F4, and any future one) is
// built from SectionHeader + SectionBody + ToolRow with a Tone, so "where am I"
// looks the same everywhere: the open section's header gets a tone bar, its body
// a tone rail, and the active tool a solid tinted row with a check. Only one
// section is open at a time (see the exclusivity effect in CanvasSidebar).

type Tone = {
  solid: string   // header bg when the section's tool is active
  bar: string     // left accent bar / rail colour (bg-*)
  rail: string    // body rail (border-*)
  tint: string    // active row bg
  icon: string    // idle icon colour
  ring: string    // open-header outline (ring-*)
}
export const TONES = {
  select:   { solid: 'bg-blue-600',   bar: 'bg-blue-400',   rail: 'border-blue-500/50',   tint: 'bg-blue-600/30',   icon: 'text-blue-400', ring: 'ring-blue-500/60' },
  wall:     { solid: 'bg-orange-700', bar: 'bg-orange-400', rail: 'border-orange-500/50', tint: 'bg-orange-600/30', icon: 'text-orange-400', ring: 'ring-orange-500/60' },
  cabinet:  { solid: 'bg-blue-700',   bar: 'bg-blue-400',   rail: 'border-blue-500/50',   tint: 'bg-blue-600/30',   icon: 'text-blue-400', ring: 'ring-blue-500/60' },
  benchtop: { solid: 'bg-teal-700',   bar: 'bg-teal-400',   rail: 'border-teal-500/50',   tint: 'bg-teal-600/30',   icon: 'text-teal-400', ring: 'ring-teal-500/60' },
  fixture:  { solid: 'bg-sky-700',    bar: 'bg-sky-400',    rail: 'border-sky-500/50',    tint: 'bg-sky-600/30',    icon: 'text-sky-400', ring: 'ring-sky-500/60' },
  cad:      { solid: 'bg-rose-700',   bar: 'bg-rose-400',   rail: 'border-rose-500/50',   tint: 'bg-rose-600/30',   icon: 'text-rose-400', ring: 'ring-rose-500/60' },
  paste:    { solid: 'bg-yellow-700', bar: 'bg-yellow-400', rail: 'border-yellow-500/50', tint: 'bg-yellow-600/30', icon: 'text-yellow-400', ring: 'ring-yellow-500/60' },
} satisfies Record<string, Tone>

function SectionHeader({ tone, icon, label, shortcut, open, active, summary, title, onClick, tour }: {
  tone: Tone; icon: React.ReactNode; label: string; shortcut?: string
  /** data-tour id the tutorial spotlights (z_tutorial). */
  tour?: string
  /** Section body expanded. Omit for headers with no dropdown (Select, Paste). */
  open?: boolean
  /** One of this section's tools is the current mode. */
  active: boolean
  /** Current tool / armed item, shown under the label so it's visible collapsed. */
  summary?: string | null
  title?: string
  onClick: () => void
}) {
  return (
    <button
      data-tour={tour}
      title={title ?? (shortcut ? `${label} (${shortcut})` : label)}
      aria-expanded={open}
      onClick={onClick}
      className={`relative w-full px-2.5 min-h-11 py-1.5 rounded-lg flex items-center gap-2.5 text-sm font-medium transition-colors
        ${active ? `${tone.solid} text-white shadow-md shadow-black/30`
          : open ? `${tone.tint} ${tone.ring} ring-1 ring-inset text-white`
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'}`}
    >
      {(open || active) && <span className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r ${active ? 'bg-white/70' : tone.bar}`} />}
      <span className={`flex-none w-5 flex items-center justify-center ${!active && open ? tone.icon : ''}`}>{icon}</span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block truncate">{label}</span>
        {summary && <span className={`block truncate text-[11px] font-normal ${active ? 'text-white/75' : 'text-gray-500'}`}>{summary}</span>}
      </span>
      {shortcut && (
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0
          ${active || open ? 'border-white/30 text-white/70' : 'border-gray-700 text-gray-600'}`}>
          {shortcut}
        </span>
      )}
      {open !== undefined && <span className={`text-xs transition-transform ${open ? 'rotate-180 opacity-70' : 'opacity-40'}`}>▾</span>}
    </button>
  )
}

function SectionBody({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <div className={`ml-2.5 pl-1.5 border-l-2 ${tone.rail} flex flex-col gap-px pt-1 pb-1`}>{children}</div>
}

function ToolRow({ tone, icon, label, active, title, onClick, iconClass, sub, tour }: {
  tone: Tone; icon?: React.ReactNode; label: string; active: boolean
  title?: string; onClick: () => void; iconClass?: string; sub?: string
  /** data-tour id the tutorial spotlights (z_tutorial). */
  tour?: string
}) {
  return (
    <button
      data-tour={tour}
      title={title ?? label}
      onClick={onClick}
      className={`relative w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors
        ${active ? `${tone.tint} text-white font-medium` : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
    >
      {active && <span className={`absolute left-0 top-1 bottom-1 w-1 rounded-r ${tone.bar}`} />}
      {icon && <span className={`flex-none w-5 flex items-center justify-center ${active ? 'text-white' : iconClass ?? tone.icon}`}>{icon}</span>}
      <span className="flex-1 min-w-0 text-left">
        <span className="block truncate">{label}</span>
        {sub && <span className="block truncate text-[10px] text-gray-500">{sub}</span>}
      </span>
      {active && <span className="text-xs text-white/80 shrink-0">✓</span>}
    </button>
  )
}

// ── Wall tools ──────────────────────────────────────────────────────────────────

const WALL_ITEMS: { mode: Mode; label: string; icon: React.ReactNode; color: string }[] = [
  { mode: 'draw_wall',   label: 'Standard Wall', icon: <WallIcon />,   color: 'text-orange-400' },
  { mode: 'draw_island', label: 'Island',         icon: <IslandIcon />, color: 'text-yellow-400' },
]
const WALL_MODES = WALL_ITEMS.map(w => w.mode)

// ── Benchtop tools ──────────────────────────────────────────────────────────────

function CadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 3.5h7M6 3.5v7" />
      <path d="M9.5 13.5l4-4M13.5 9.5l-.4 2.6M13.5 9.5l-2.6.4" />
    </svg>
  )
}

function FixtureIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="1.5" width="11" height="13" rx="1" fill="currentColor" fillOpacity="0.12" />
      <line x1="2.5" y1="5" x2="13.5" y2="5" />
      <rect x="5" y="7.5" width="6" height="4.5" rx="0.5" />
    </svg>
  )
}

const BT_ICON = (d: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const BENCHTOP_TOOLS: { mode: Mode; label: string; icon: React.ReactNode; color: string; divider?: boolean }[] = [
  { mode: 'draw_benchtop',      label: 'Draw Polygon',   color: 'text-teal-400', icon: <BenchtopIcon /> },
  { mode: 'draw_benchtop_rect', label: 'Draw Rectangle', color: 'text-teal-400', icon: BT_ICON(<rect x="2" y="4" width="12" height="8" rx="0.8" fill="currentColor" fillOpacity="0.12"/>) },
  { mode: 'draw_benchtop_line', label: 'Line + Offset',  color: 'text-teal-400', icon: BT_ICON(<>
    <path d="M2 9 L9 2 L14 7 L7 14 Z" fill="currentColor" fillOpacity="0.12" strokeDasharray="2 1.5"/>
    <line x1="2" y1="9" x2="9" y2="2" strokeWidth="2.2"/>
  </>) },
  { mode: 'draw_benchtop_l',    label: 'Draw L-Shape',   color: 'text-teal-400', icon: BT_ICON(<path d="M2 2 L2 14 L8 14 L8 8 L14 8 L14 2 Z" fill="currentColor" fillOpacity="0.12"/>) },
  { mode: 'draw_benchtop_u',    label: 'Draw U-Shape',   color: 'text-teal-400', icon: BT_ICON(<path d="M2 2 L2 14 L5 14 L5 8 L11 8 L11 14 L14 14 L14 2 Z" fill="currentColor" fillOpacity="0.12"/>) },
  { mode: 'draw_benchtop_cutout_rect', label: 'Rect Cutout', color: 'text-red-400', divider: true, icon: BT_ICON(<>
    <rect x="1" y="1" width="14" height="14" rx="1" fill="currentColor" fillOpacity="0.08"/>
    <rect x="4" y="4" width="8" height="8" rx="0.5" fill="#111827" stroke="currentColor" strokeDasharray="2 1.5"/>
  </>) },
  { mode: 'draw_benchtop_cutout_circle', label: 'Circle Cutout', color: 'text-red-400', icon: BT_ICON(<>
    <rect x="1" y="1" width="14" height="14" rx="1" fill="currentColor" fillOpacity="0.08"/>
    <circle cx="8" cy="8" r="4" fill="#111827" stroke="currentColor" strokeDasharray="2 1.5"/>
  </>) },
]

const NAV_KEY = 'rhk-sidebar-cab-nav'
const ORPHAN = '__uncategorised__'

// ── DB-backed library types ─────────────────────────────────────────────────────

type Category = { id: string; name: string; sort_order: number; accent_color: string | null; parent_id: string | null }
type Scope    = 'all' | 'job'
type CabCtxMenu = { x: number; y: number; categoryId?: string | null; definitionId?: string }

// ── Component ─────────────────────────────────────────────────────────────────

export default function CanvasSidebar({
  room, onOpenRoomProperties, roomSwitcherRef,
  mode, onSelectMode,
  armedDefinitionId, onArmDefinition, armedDraft = null, matColours, ebByMatId,
  wallMenuOpen, setWallMenuOpen,
  cabMenuOpen, setCabMenuOpen,
  benchtopMenuOpen, setBenchtopMenuOpen, onDrawBenchtopInShapeEditor,
  fixtureMenuOpen = false, setFixtureMenuOpen, armedFixtureId = null, onArmFixture,
  cadOn = false, onToggleCad,
  clipboard, sidebarW, libRefresh = 0,
}: {
  room: Room
  onOpenRoomProperties: () => void
  roomSwitcherRef: React.Ref<RoomSwitcherHandle>
  mode: Mode
  onSelectMode: (m: Mode) => void
  armedDefinitionId: string | null
  onArmDefinition: (def: CabinetDefinition) => void
  /** Armed definition as an editable draft instance — drives the 3D preview. */
  armedDraft?: CabinetInstance | null
  matColours?: MatColours
  ebByMatId?: EbByMatId
  wallMenuOpen: boolean
  setWallMenuOpen: (v: boolean) => void
  cabMenuOpen: boolean
  setCabMenuOpen: (v: boolean) => void
  benchtopMenuOpen: boolean
  setBenchtopMenuOpen: (v: boolean) => void
  /** F4 → Draw in Shape Editor: new benchtop drawn straight in the full editor. */
  onDrawBenchtopInShapeEditor?: () => void
  /** F6 Fixtures & appliances (z_fixtures P2). */
  fixtureMenuOpen?: boolean
  setFixtureMenuOpen?: (v: boolean) => void
  armedFixtureId?: string | null
  onArmFixture?: (item: FixtureCatalogItem) => void
  /** F7 CAD annotations (z_CAD_tool): mode on + toggle. */
  cadOn?: boolean
  onToggleCad?: () => void
  clipboard: CabinetInstance | null
  sidebarW: number
  /** Bumped by the parent after a Save-to-library so the palette reloads. */
  libRefresh?: number
}) {
  // ── One section open at a time ──
  // Menus can also be opened from CanvasClient (F2/F3/F4 keys, entering Benchtop
  // mode), so close the others whenever one flips open, wherever it came from.
  const prevOpen = useRef({ wall: wallMenuOpen, cab: cabMenuOpen, bt: benchtopMenuOpen, fx: fixtureMenuOpen })
  useEffect(() => {
    const p = prevOpen.current
    const closeFx = () => setFixtureMenuOpen?.(false)
    if (wallMenuOpen && !p.wall) { setCabMenuOpen(false); setBenchtopMenuOpen(false); closeFx() }
    else if (cabMenuOpen && !p.cab) { setWallMenuOpen(false); setBenchtopMenuOpen(false); closeFx() }
    else if (benchtopMenuOpen && !p.bt) { setWallMenuOpen(false); setCabMenuOpen(false); closeFx() }
    else if (fixtureMenuOpen && !p.fx) { setWallMenuOpen(false); setCabMenuOpen(false); setBenchtopMenuOpen(false) }
    prevOpen.current = { wall: wallMenuOpen, cab: cabMenuOpen, bt: benchtopMenuOpen, fx: fixtureMenuOpen }
  }, [wallMenuOpen, cabMenuOpen, benchtopMenuOpen, fixtureMenuOpen, setWallMenuOpen, setCabMenuOpen, setBenchtopMenuOpen, setFixtureMenuOpen])

  // ── Fixtures catalogue (F6) — loaded the first time the section opens ──
  const [fixtureItems, setFixtureItems] = useState<FixtureCatalogItem[] | null>(null)
  // Library categories (P6) — headed by their icon, in the library's order.
  const [fixtureGroups, setFixtureGroups] = useState<FixtureGroup[]>([])
  useEffect(() => {
    if (!fixtureMenuOpen || fixtureItems) return
    let live = true
    void Promise.all([
      supabase.from('fixture_catalog').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('fixture_groups').select('*').order('sort_order').order('name'),
    ]).then(([{ data }, { data: g }]) => {
      if (!live) return
      setFixtureItems((data ?? []) as FixtureCatalogItem[])
      setFixtureGroups((g ?? []) as FixtureGroup[])
    })
    return () => { live = false }
  }, [fixtureMenuOpen, fixtureItems])
  // Fixture search — same matcher as the cabinet library (src/lib/cabinetSearch):
  // name ranks first, then group, then kind / brand / model / notes.
  const [fixtureSearch, setFixtureSearch] = useState('')
  const fixtureHits = (() => {
    const tokens = searchTokens(fixtureSearch)
    if (!tokens.length || !fixtureItems) return null
    const groupName = (i: FixtureCatalogItem) => fixtureGroups.find(g => g.id === i.group_id)?.name ?? 'Other'
    return fixtureItems
      .map((i, n) => ({ i, n, s: scoreDef({ name: i.name, description: [i.kind, i.brand, i.model_no, i.notes].filter(Boolean).join(' ') }, tokens, groupName(i)) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.n - b.n)
      .map(x => x.i)
  })()

  // ── Library data (categories + definitions) ──
  const [categories, setCategories]     = useState<Category[]>([])
  const [definitions, setDefinitions]   = useState<CabinetDefinition[]>([])
  const [placedDefIds, setPlacedDefIds] = useState<Set<string>>(new Set())
  const [libError, setLibError]         = useState<string | null>(null)

  const [search, setSearch]   = useState('')
  const [scope, setScope]     = useState<Scope>('all')
  const [openCats, setOpenCats] = useState<Set<string>>(new Set())
  const [ctxMenu, setCtxMenu] = useState<CabCtxMenu | null>(null)
  const isAdmin = useIsAdmin()   // the right-click menu edits the shared library
  const [movingDef, setMovingDef] = useState<CabinetDefinition | null>(null)
  const [moveTarget, setMoveTarget] = useState<string | null>(null)
  // Drill-down position in the library: null = top-level tiles, else a category
  // id (or ORPHAN). Remembered per browser so F3 reopens where you left off.
  // (Lazy read is hydration-safe: the library body only renders once F3 is opened.)
  const [navRaw, setNavCat] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try { return localStorage.getItem(NAV_KEY) } catch { return null /* storage blocked */ }
  })
  function goTo(id: string | null) {
    setNavCat(id)
    try { if (id) localStorage.setItem(NAV_KEY, id); else localStorage.removeItem(NAV_KEY) } catch { /* storage blocked */ }
  }

  const reloadCategories = useCallback(async () => {
    const { data } = await supabase.from('cabinet_categories')
      .select('id,name,sort_order,accent_color,parent_id').eq('active', true).order('sort_order')
    const rows = (data ?? []) as Category[]
    setCategories(rows)
    return rows
  }, [])

  // Load taxonomy + definitions on mount and whenever the parent bumps libRefresh
  // (e.g. after a Save-to-library), so newly saved cabinets/categories show up.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [cats, def] = await Promise.all([
        reloadCategories(),
        supabase.from('cabinet_definitions').select('*').eq('is_library_item', true).eq('active', true).order('sort_order'),
      ])
      if (cancelled) return
      if (def.error) { setLibError(def.error.message); return }
      setDefinitions((def.data ?? []) as CabinetDefinition[])
      // Expand all known categories (keep any the user already opened).
      setOpenCats(prev => { const n = new Set(prev); cats.forEach(c => n.add(c.id)); return n })
    })()
    return () => { cancelled = true }
  }, [reloadCategories, libRefresh])

  // Definitions placed somewhere in the current job → drives the "This Job" scope.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('cabinet_instances')
        .select('cabinet_definition_id, rooms!inner(project_id)')
        .eq('rooms.project_id', room.project_id)
        .not('cabinet_definition_id', 'is', null)
      if (cancelled || error || !data) return
      setPlacedDefIds(new Set(data.map(r => r.cabinet_definition_id as string)))
    })()
    return () => { cancelled = true }
  }, [room.project_id])

  // Close the right-click menu on any outside interaction.
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [ctxMenu])

  function toggleCat(id: string) {
    setOpenCats(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const cabActive      = mode === 'place_definition'
  const wallActive     = WALL_MODES.includes(mode)
  // F4 Benchtop mode (any benchtop tool) — only benchtops are clickable while on.
  const benchtopActive = isBenchtopMode(mode)

  // A definition is visible if it passes the scope + search filters.
  // Search matches every typed word against code, description, class and
  // category path (src/lib/cabinetSearch).
  const q = search.trim().toLowerCase()
  const qTokens = searchTokens(search)
  const catPath = (id: string | null): string => {
    const names: string[] = []
    let c = id ? categories.find(x => x.id === id) : undefined
    while (c && names.length < 20) { names.unshift(c.name); c = c.parent_id ? categories.find(x => x.id === c!.parent_id) : undefined }
    return names.join(' › ')
  }
  const searchScore = (d: CabinetDefinition) => scoreDef(d, qTokens, catPath(d.category_id))
  const matches = (d: CabinetDefinition) => {
    if (scope === 'job' && !placedDefIds.has(d.id)) return false
    if (q) return searchScore(d) > 0
    return true
  }
  const visibleCount = definitions.filter(matches).length
  const armedDef = definitions.find(d => d.id === armedDefinitionId) ?? null

  // ── Category tree ──
  const childrenOf = (parentId: string | null) =>
    categories.filter(c => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const defsOf = (catId: string) => definitions.filter(d => d.category_id === catId && matches(d))
  const orphanDefs = definitions.filter(d => matches(d) && !categories.some(c => c.id === d.category_id))
  // Stale nav target (category deleted / emptied) falls back to the top level.
  const navCat = !navRaw ? null
    : navRaw === ORPHAN ? (orphanDefs.length ? ORPHAN : null)
    : categories.length === 0 || categories.some(c => c.id === navRaw) ? navRaw : null

  async function createCategory(parentId: string | null) {
    const name = typeof window !== 'undefined' ? window.prompt(parentId ? 'New sub-category name' : 'New category name') : null
    if (!name?.trim()) { setCtxMenu(null); return }
    const sort_order = childrenOf(parentId).reduce((m, c) => Math.max(m, c.sort_order), -1) + 1
    const { data, error } = await supabase.from('cabinet_categories')
      .insert({ name: name.trim(), parent_id: parentId, sort_order }).select('id').single()
    if (error) { setLibError(error.message); setCtxMenu(null); return }
    await reloadCategories()
    setOpenCats(prev => { const n = new Set(prev); if (parentId) n.add(parentId); if (data) n.add(data.id as string); return n })
    setCtxMenu(null)
  }
  async function renameCategory(cat: Category) {
    const name = typeof window !== 'undefined' ? window.prompt('Rename category', cat.name) : null
    setCtxMenu(null)
    if (!name?.trim() || name.trim() === cat.name) return
    const { error } = await supabase.from('cabinet_categories').update({ name: name.trim() }).eq('id', cat.id)
    if (error) setLibError(error.message); else await reloadCategories()
  }
  async function deleteCategory(cat: Category) {
    setCtxMenu(null)
    const hasKids = childrenOf(cat.id).length > 0
    const hasDefs = definitions.some(d => d.category_id === cat.id)
    if (hasKids || hasDefs) { window.alert(`“${cat.name}” isn’t empty — move its ${hasKids ? 'sub-categories' : 'cabinets'} out first.`); return }
    if (!(await confirmDelete({ title: 'Delete Category', message: `Delete category “${cat.name}”?` }))) return
    const { error } = await supabase.from('cabinet_categories').delete().eq('id', cat.id)
    if (error) setLibError(error.message); else await reloadCategories()
  }

  async function deleteDefinition(def: CabinetDefinition) {
    setCtxMenu(null)
    if (!(await confirmDelete({ title: 'Delete Cabinet', message: `Delete “${def.name}” from the library? Placed cabinets are unaffected.` }))) return
    const { error } = await supabase.from('cabinet_definitions').delete().eq('id', def.id)
    if (error) { setLibError(error.message); return }
    setDefinitions(ds => ds.filter(d => d.id !== def.id))
  }

  async function renameDefinition(def: CabinetDefinition) {
    setCtxMenu(null)
    const name = typeof window !== 'undefined' ? window.prompt('Rename cabinet', def.name) : null
    if (!name?.trim() || name.trim() === def.name) return
    const { error } = await supabase.from('cabinet_definitions').update({ name: name.trim() }).eq('id', def.id)
    if (error) { setLibError(error.message); return }
    setDefinitions(ds => ds.map(d => d.id === def.id ? { ...d, name: name.trim() } : d))
  }
  async function duplicateDefinition(def: CabinetDefinition) {
    setCtxMenu(null)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, ...rest } = def
    const sort_order = definitions.filter(d => d.category_id === def.category_id).reduce((m, d) => Math.max(m, d.sort_order), -1) + 1
    const { data, error } = await supabase.from('cabinet_definitions')
      .insert({ ...rest, name: `${def.name} copy`, sort_order }).select('*').single()
    if (error) { setLibError(error.message); return }
    if (data) setDefinitions(ds => [...ds, data as CabinetDefinition])
  }

  function startMove(def: CabinetDefinition) {
    setCtxMenu(null)
    setMoveTarget(def.category_id ?? null)
    setMovingDef(def)
  }
  async function confirmMove() {
    if (!movingDef) return
    const { error } = await supabase.from('cabinet_definitions').update({ category_id: moveTarget }).eq('id', movingDef.id)
    if (error) { setLibError(error.message); return }
    setDefinitions(ds => ds.map(d => d.id === movingDef.id ? { ...d, category_id: moveTarget } : d))
    if (moveTarget) setOpenCats(prev => new Set(prev).add(moveTarget))
    setMovingDef(null)
  }

  // ── Drill-down helpers ──
  const catById = (id: string | null | undefined) => (id ? categories.find(c => c.id === id) ?? null : null)
  // Root → cat chain (guarded against parent cycles).
  function pathTo(id: string | null): Category[] {
    const out: Category[] = []
    let c = catById(id)
    while (c && out.length < 20) { out.unshift(c); c = catById(c.parent_id) }
    return out
  }
  const countIn = (catId: string): number =>
    defsOf(catId).length + childrenOf(catId).reduce((n, k) => n + countIn(k.id), 0)
  // Categories on the armed cabinet's path — lit up so you can see where it lives.
  const armedPath = new Set(cabActive ? pathTo(armedDef?.category_id ?? null).map(c => c.id) : [])
  const armedIsOrphan = cabActive && !!armedDef && !catById(armedDef.category_id)
  // Colour of a category = its own accent, else its top-level ancestor's, else palette.
  const roots = childrenOf(null)
  function colourOf(cat: Category): string {
    const chain = pathTo(cat.id)
    const own = [...chain].reverse().find(c => c.accent_color)?.accent_color
    if (own) return own
    const i = roots.findIndex(r => r.id === chain[0]?.id)
    return CAT_PALETTE[(i < 0 ? 0 : i) % CAT_PALETTE.length]
  }


  function defRow(def: CabinetDefinition, sub?: string, desc?: string | null) {
    const sel = cabActive && armedDefinitionId === def.id
    return (
      <button
        key={def.id}
        onClick={() => onArmDefinition(def)}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, definitionId: def.id }) }}
        draggable
        onDragStart={e => { e.dataTransfer.setData('application/x-rhk-cab-def', def.id); e.dataTransfer.effectAllowed = 'copy' }}
        title={def.description ? `${def.name} — ${def.description}` : def.name}
        className={`relative w-full flex items-center gap-2 pl-3 pr-2 py-2 rounded-md text-sm transition-colors
          ${sel ? 'bg-blue-600 text-white font-medium shadow-md shadow-black/30' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
      >
        {sel && <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-white/80" />}
        <span className="flex-1 min-w-0 text-left">
          <span className="block truncate">{def.name}</span>
          {sub && <span className={`block truncate text-[10px] ${sel ? 'text-white/70' : 'text-gray-500'}`}>{sub}</span>}
          {desc && <span className={`block truncate text-[10px] ${sel ? 'text-white/60' : 'text-gray-600'}`}>{desc}</span>}
        </span>
        {sel && <span className="text-xs shrink-0">✓</span>}
      </button>
    )
  }

  // Top level: one big tile per root category.
  function renderTiles() {
    const tiles = roots.filter(c => scope === 'all' || countIn(c.id) > 0)
    return (
      <div className="grid gap-1 px-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}>
        {tiles.map(cat => {
          const col = colourOf(cat)
          const onPath = armedPath.has(cat.id)
          return (
            <button
              key={cat.id}
              onClick={() => goTo(cat.id)}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, categoryId: cat.id }) }}
              title={`Open ${cat.name}`}
              className={`relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 px-0.5 rounded-lg min-w-0 border bg-gray-800/50 hover:bg-gray-800 transition-colors
                ${onPath ? 'border-blue-400 ring-1 ring-blue-400/50' : 'border-gray-700 hover:border-gray-500'}`}
              style={{ borderTopColor: col, borderTopWidth: 3 }}
            >
              <span style={{ color: col }}>{catIconFor(cat.name)}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-200 truncate max-w-full">{cat.name}</span>
              <span className="text-[10px] text-gray-500">{countIn(cat.id)}</span>
              {onPath && <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-400" title="Armed cabinet is in here" />}
            </button>
          )
        })}
        {orphanDefs.length > 0 && (
          <button
            onClick={() => goTo(ORPHAN)}
            className={`relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 px-0.5 rounded-lg min-w-0 border border-dashed bg-gray-800/30 hover:bg-gray-800 transition-colors
              ${armedIsOrphan ? 'border-blue-400' : 'border-gray-700'}`}
          >
            <span className="text-gray-500"><FolderIcon /></span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Other</span>
            <span className="text-[10px] text-gray-500">{orphanDefs.length}</span>
          </button>
        )}
      </div>
    )
  }

  // Inside a category: breadcrumb, sub-category rows, then its cabinets.
  function renderLevel() {
    const isOrphan = navCat === ORPHAN
    const cat = isOrphan ? null : catById(navCat)
    const chain = pathTo(navCat)
    const col = cat ? colourOf(cat) : '#6b7280'
    const kids = cat ? childrenOf(cat.id).filter(k => scope === 'all' || countIn(k.id) > 0) : []
    const defs = cat ? defsOf(cat.id) : orphanDefs
    return (
      <div className="flex flex-col gap-1">
        {/* Breadcrumb: back + current level on one line, ancestors (clickable) above */}
        <div className="flex flex-col gap-0.5 px-1 min-w-0">
          <div className="flex items-center gap-1 text-[10px] min-w-0 overflow-hidden pl-7">
            <button onClick={() => goTo(null)} className="shrink-0 text-gray-500 hover:text-gray-200">Cabinets</button>
            {chain.slice(0, -1).map(c => (
              <span key={c.id} className="flex items-center gap-1 min-w-0">
                <span className="text-gray-600">/</span>
                <button onClick={() => goTo(c.id)} className="truncate text-gray-500 hover:text-gray-200">{c.name}</button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={() => goTo(chain.length > 1 ? chain[chain.length - 2].id : null)}
              title="Back"
              className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-gray-300 bg-gray-800 hover:bg-gray-700 hover:text-white"
            >‹</button>
            <span className="truncate text-xs font-semibold uppercase tracking-wider" style={{ color: col }}>
              {isOrphan ? 'Other' : cat?.name}
            </span>
          </div>
        </div>

        <div
          className="flex flex-col gap-px rounded-lg bg-gray-800/30 p-1 min-h-[40px]"
          style={{ boxShadow: `inset 3px 0 0 ${col}` }}
          onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, categoryId: cat?.id ?? null }) }}
        >
          {kids.map(k => {
            const onPath = armedPath.has(k.id)
            return (
              <button
                key={k.id}
                onClick={() => goTo(k.id)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, categoryId: k.id }) }}
                className={`w-full flex items-center gap-2 pl-2.5 pr-2 py-2 rounded-md text-sm transition-colors
                  ${onPath ? 'bg-blue-600/15 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
              >
                <span style={{ color: colourOf(k) }}><FolderIcon /></span>
                <span className="flex-1 truncate text-left font-medium">{k.name}</span>
                {onPath && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" title="Armed cabinet is in here" />}
                <span className="text-[10px] text-gray-500 tabular-nums">{countIn(k.id)}</span>
                <span className="text-gray-500">›</span>
              </button>
            )
          })}
          {kids.length > 0 && defs.length > 0 && <div className="border-t border-gray-700/60 my-1 mx-1" />}
          {defs.map(def => defRow(def))}
          {kids.length === 0 && defs.length === 0 && (
            <p className="px-2 py-2 text-xs text-gray-600 italic">
              {scope === 'job' ? 'Nothing from here placed in this job yet.' : 'Empty — right-click to add a sub-category.'}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Search: flat list of hits across the whole library, each with its path.
  function renderSearch() {
    // Best match first; equal scores keep library order.
    const hits = definitions.filter(matches)
      .map((d, i) => ({ d, i, s: searchScore(d) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map(x => x.d)
    return (
      <div className="flex flex-col gap-px px-0.5">
        {hits.map(def => defRow(def, catPath(def.category_id ?? null) || 'Other', def.description))}
        {hits.length === 0 && <p className="px-2 py-2 text-xs text-gray-600 italic">No cabinets match “{search.trim()}”.</p>}
      </div>
    )
  }

  // Selectable category tree for the Move dialog.
  function renderMoveNode(cat: Category, depth: number): React.ReactNode {
    const kids = childrenOf(cat.id)
    const open = openCats.has(cat.id)
    const sel = moveTarget === cat.id
    return (
      <div key={cat.id}>
        <div
          onClick={() => setMoveTarget(cat.id)}
          className={`flex items-center gap-1 pr-2 py-1 rounded cursor-pointer text-sm transition-colors
            ${sel ? 'bg-blue-600/25 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          style={{ paddingLeft: 6 + depth * 14 }}
        >
          <span onClick={e => { e.stopPropagation(); if (kids.length) toggleCat(cat.id) }} className="w-3 text-[9px] opacity-60 shrink-0">{kids.length ? (open ? '▾' : '▸') : '·'}</span>
          <span className="flex-1 truncate">{cat.name}</span>
        </div>
        {open && kids.map(k => renderMoveNode(k, depth + 1))}
      </div>
    )
  }

  return (
    <aside
      className="flex-none bg-gray-900 flex flex-col border-r border-gray-800"
      style={{ width: sidebarW }}
    >
      {/* ── Room name header + switcher (always visible) ── */}
      <RoomSwitcher ref={roomSwitcherRef} room={room} onOpenRoomProperties={onOpenRoomProperties} />

      {/* ── Scrollable tool area ── */}
      <div className="flex-1 flex flex-col py-2 gap-0.5 overflow-y-auto px-2 min-h-0">
        <SectionHeader
          tone={TONES.select} icon={<SelectIcon />} label="Select" title="Back to Select (Esc)"
          active={false} onClick={() => onSelectMode('select')}
        />

        <div className="border-t border-gray-800 my-1 mx-1" />

        {/* Wall (F2) */}
        <SectionHeader
          tone={TONES.wall} icon={<WallIcon />} label="Wall" shortcut="F2" tour="tool-wall"
          open={wallMenuOpen} active={wallActive}
          summary={wallActive ? WALL_ITEMS.find(w => w.mode === mode)?.label : null}
          onClick={() => setWallMenuOpen(!wallMenuOpen)}
        />
        {wallMenuOpen && (
          <SectionBody tone={TONES.wall}>
            {WALL_ITEMS.map(({ mode: m, label, icon, color }) => (
              <ToolRow key={m} tone={TONES.wall} icon={icon} iconClass={color} label={label} tour={`mode-${m}`}
                active={mode === m} onClick={() => onSelectMode(m)} />
            ))}
          </SectionBody>
        )}

        <div className="border-t border-gray-800 my-1 mx-1" />

        {/* Cabinet library (F3) — drill-down: tiles → category → cabinets */}
        <SectionHeader
          tone={TONES.cabinet} icon={<CabinetIcon />} label="Cabinet" shortcut="F3" title="Cabinet Library (F3)" tour="tool-cabinet"
          open={cabMenuOpen} active={cabActive}
          summary={cabActive && armedDef ? armedDef.name : null}
          onClick={() => setCabMenuOpen(!cabMenuOpen)}
        />
        {cabMenuOpen && (
          <SectionBody tone={TONES.cabinet}>
            {libError && <p className="px-2 py-1.5 text-xs text-red-400">{libError}</p>}

            {/* Search + scope */}
            <div className="px-1 pb-1 flex flex-col gap-1.5">
              <div className="relative">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => {
                    // Esc: clear the search and go back to the F3 top-level tiles.
                    // Stop it here so the canvas-wide Esc handler doesn't also fire.
                    if (e.key !== 'Escape') return
                    e.preventDefault(); e.stopPropagation()
                    setSearch(''); goTo(null); e.currentTarget.blur()
                  }}
                  placeholder="Search code, description, folder…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-md pl-2 pr-6 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
                />
                {search && (
                  <button
                    type="button" title="Clear search" aria-label="Clear search"
                    onClick={() => setSearch('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700"
                  >
                    <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
                  </button>
                )}
              </div>
              <div className="flex gap-1 text-xs">
                {(['all', 'job'] as Scope[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className={`flex-1 py-1 rounded-md border transition-colors
                      ${scope === s ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-700 text-gray-400 hover:text-gray-200'}`}
                  >
                    {s === 'all' ? 'All' : 'This Job'}
                  </button>
                ))}
              </div>
            </div>

            {/* Right-click for New category / Rename / Delete. */}
            <div onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, categoryId: q || !navCat || navCat === ORPHAN ? null : navCat }) }}>
              {q ? renderSearch() : navCat ? renderLevel() : renderTiles()}

              {categories.length === 0 && definitions.length === 0 && (
                <p className="px-2 py-2 text-xs text-gray-600 italic">Right-click to add a category.</p>
              )}
              {!q && !navCat && scope === 'job' && visibleCount === 0 && definitions.length > 0 && (
                <p className="px-2 py-2 text-xs text-gray-600 italic">No library cabinets placed in this job yet.</p>
              )}
            </div>
          </SectionBody>
        )}

        <div className="border-t border-gray-800 my-1 mx-1" />

        {/* Benchtop (F4) */}
        <SectionHeader
          tone={TONES.benchtop} icon={<BenchtopIcon />} label="Benchtop" shortcut="F4" tour="tool-benchtop"
          title="Benchtop (F4) — in Benchtop mode only benchtops can be selected; Esc to leave"
          open={benchtopMenuOpen} active={benchtopActive}
          summary={benchtopActive ? (mode === 'benchtop_select' ? 'Select Tops' : BENCHTOP_TOOLS.find(t => t.mode === mode)?.label ?? 'Benchtop mode') : null}
          onClick={() => setBenchtopMenuOpen(!benchtopMenuOpen)}
        />
        {benchtopMenuOpen && (
          <SectionBody tone={TONES.benchtop}>
            {/* Benchtop mode: only benchtops are pickable on the canvas (Esc / Select to leave). */}
            <ToolRow
              tone={TONES.benchtop} icon={<SelectIcon />} label="Select Tops"
              title="Benchtop mode — only benchtops can be selected; Esc to leave"
              active={mode === 'benchtop_select'} onClick={() => onSelectMode('benchtop_select')}
            />
            <div className="border-t border-gray-800 my-1 mx-1" />
            {onDrawBenchtopInShapeEditor && (
              <ToolRow
                tone={TONES.benchtop} iconClass="text-blue-400" label="Draw in Shape Editor" active={false}
                title="Open the full Shape Editor for a new benchtop. Select base cabinets first to start from their footprint."
                icon={BT_ICON(<><path d="M2 12V4h7l5 4v4z" fill="currentColor" fillOpacity="0.12"/><path d="M11.5 1.5l3 3" /></>)}
                onClick={onDrawBenchtopInShapeEditor}
              />
            )}
            {BENCHTOP_TOOLS.map(t => (
              <div key={t.mode}>
                {t.divider && <div className="border-t border-gray-800 my-1 mx-1" />}
                <ToolRow tone={TONES.benchtop} icon={t.icon} iconClass={t.color} label={t.label} tour={`mode-${t.mode}`}
                  active={mode === t.mode} onClick={() => onSelectMode(t.mode)} />
              </div>
            ))}
          </SectionBody>
        )}

        {onArmFixture && setFixtureMenuOpen && (<>
          <div className="border-t border-gray-800 my-1 mx-1" />

          {/* Fixtures & appliances (F6) — z_fixtures */}
          <SectionHeader
            tone={TONES.fixture} icon={<FixtureIcon />} label="Fixtures" shortcut="F6" tour="tool-fixtures"
            title="Fixtures & appliances (F6) — pick one, click to drop it (backs onto the nearest wall; Shift = free, R = turn); Esc to finish"
            open={fixtureMenuOpen} active={mode === 'place_fixture'}
            summary={mode === 'place_fixture' ? (fixtureItems?.find(i => i.id === armedFixtureId)?.name ?? 'Moving') : null}
            onClick={() => setFixtureMenuOpen(!fixtureMenuOpen)}
          />
          {fixtureMenuOpen && (
            <SectionBody tone={TONES.fixture}>
              {fixtureItems === null && <div className="px-2.5 py-1.5 text-xs text-gray-500">Loading…</div>}
              {fixtureItems?.length === 0 && (
                <div className="px-2.5 py-1.5 text-xs text-gray-500">No fixtures yet — add them in Settings → Fixtures &amp; Appliances.</div>
              )}
              {!!fixtureItems?.length && (
                <div className="px-1 pb-1">
                  <div className="relative">
                    <input
                      value={fixtureSearch}
                      onChange={e => setFixtureSearch(e.target.value)}
                      onKeyDown={e => {
                        // Esc: clear the search. Stop it here so the canvas-wide Esc handler doesn't also fire.
                        if (e.key !== 'Escape') return
                        e.preventDefault(); e.stopPropagation()
                        setFixtureSearch(''); e.currentTarget.blur()
                      }}
                      placeholder="Search name, brand, model…"
                      className="w-full bg-gray-800 border border-gray-700 rounded-md pl-2 pr-6 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
                    />
                    {fixtureSearch && (
                      <button
                        type="button" title="Clear search" aria-label="Clear search"
                        onClick={() => setFixtureSearch('')}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700"
                      >
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              )}
              {fixtureHits && (fixtureHits.length === 0
                ? <div className="px-2.5 py-1.5 text-xs text-gray-500 italic">No fixtures match.</div>
                : fixtureHits.map(i => (
                  <ToolRow key={i.id} tone={TONES.fixture} label={i.name}
                    sub={`${i.width}×${i.depth}×${i.height}`}
                    title={[i.kind, i.brand, i.model_no].filter(Boolean).join(' · ') || i.name}
                    active={mode === 'place_fixture' && armedFixtureId === i.id}
                    onClick={() => onArmFixture(i)} />
                )))}
              {!fixtureHits && [...fixtureGroups.map(g => ({ key: g.id, label: g.name, icon: g.icon })), { key: '', label: 'Other', icon: 'Package' }].map(g => {
                const items = fixtureItems?.filter(i => g.key
                  ? i.group_id === g.key
                  : !i.group_id || !fixtureGroups.some(x => x.id === i.group_id)) ?? []
                if (!items.length) return null
                return (
                  <div key={g.key || 'other'}>
                    <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                      <CategoryIcon name={g.icon} size={12} />{g.label}
                    </div>
                    {items.map(i => (
                      <ToolRow key={i.id} tone={TONES.fixture} label={i.name}
                        sub={`${i.width}×${i.depth}×${i.height}`}
                        title={[i.kind, i.brand, i.model_no].filter(Boolean).join(' · ') || i.name}
                        active={mode === 'place_fixture' && armedFixtureId === i.id}
                        onClick={() => onArmFixture(i)} />
                    ))}
                  </div>
                )
              })}
            </SectionBody>
          )}
        </>)}

        {onToggleCad && (<>
          <div className="border-t border-gray-800 my-1 mx-1" />
          {/* CAD annotations (F7) — z_CAD_tool. Opens the ribbon under the view tabs. */}
          <SectionHeader
            tone={TONES.cad} icon={<CadIcon />} label="CAD" shortcut="F7" tour="tool-cad"
            title="CAD annotations (F7): text, text boxes and markup that print on the shop drawings. Esc / F7 to finish"
            active={cadOn} summary={cadOn ? 'Annotating' : null}
            onClick={onToggleCad}
          />
        </>)}

        {clipboard && (
          <>
            <div className="border-t border-gray-800 my-1 mx-1" />
            <SectionHeader
              tone={TONES.paste} icon={<PasteIcon />}
              label={`Paste: ${clipboard.label ?? clipboard.assembly_class}`}
              active={mode === 'paste'} onClick={() => onSelectMode('paste')}
            />
          </>
        )}
      </div>

      {/* ── 3-D preview of the armed definition — pinned to the bottom ── */}
      {armedDef && armedDraft && (
        <div className="flex-none border-t border-gray-800 p-2">
          <CabinetPreview3D
            draft={armedDraft}
            customParts={armedDef.custom_parts}
            label={armedDef.name}
            canvasWidth={sidebarW - 16}
            materialColours={matColours as MatColMap | undefined}
            ebByMatId={ebByMatId}
          />
        </div>
      )}

      {/* ── 3-D preview of the armed fixture (F6) — same place as the cabinet one ── */}
      {mode === 'place_fixture' && armedFixtureId && (() => {
        const item = fixtureItems?.find(i => i.id === armedFixtureId)
        return item ? (
          <div className="flex-none border-t border-gray-800 p-2">
            <FixturePreview3D item={item} canvasWidth={sidebarW - 16} />
          </div>
        ) : null
      })()}

      {/* ── Right-click menu (cabinet or category) ── */}
      {ctxMenu && isAdmin && (() => {
        const item = 'w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 transition-colors'
        const def = ctxMenu.definitionId ? definitions.find(d => d.id === ctxMenu.definitionId) ?? null : null
        const cat = ctxMenu.categoryId ? categories.find(c => c.id === ctxMenu.categoryId) ?? null : null
        return (
          <div
            className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px]"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onMouseDown={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
          >
            {def ? (
              <>
                <button className={`${item} text-gray-200`} onClick={() => renameDefinition(def)}>Rename…</button>
                <button className={`${item} text-gray-200`} onClick={() => duplicateDefinition(def)}>Duplicate</button>
                <button className={`${item} text-gray-200`} onClick={() => startMove(def)}>Move to…</button>
                <button className={`${item} text-red-400`} onClick={() => deleteDefinition(def)}>Delete “{def.name}”</button>
              </>
            ) : (
              <>
                <button className={`${item} text-gray-200`} onClick={() => createCategory(ctxMenu.categoryId ?? null)}>
                  {cat ? <>New category inside <span className="text-gray-400">“{cat.name}”</span></> : 'New category'}
                </button>
                {cat && (
                  <>
                    <button className={`${item} text-gray-200`} onClick={() => renameCategory(cat)}>Rename…</button>
                    <button className={`${item} text-red-400`} onClick={() => deleteCategory(cat)}>Delete</button>
                  </>
                )}
              </>
            )}
          </div>
        )
      })()}

      {/* ── Move cabinet dialog ── */}
      {movingDef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={() => setMovingDef(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-80 p-5 flex flex-col gap-3" onMouseDown={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-white">Move <span className="text-gray-300">“{movingDef.name}”</span></p>
            <div className="max-h-56 overflow-y-auto bg-gray-800/40 border border-gray-700 rounded-md p-1">
              <div
                onClick={() => setMoveTarget(null)}
                className={`flex items-center gap-1 pr-2 py-1 rounded cursor-pointer text-sm ${moveTarget === null ? 'bg-blue-600/25 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
                style={{ paddingLeft: 6 }}
              >
                <span className="w-3 text-[9px] opacity-60 shrink-0">·</span>
                <span className="flex-1 truncate italic">Uncategorised</span>
              </div>
              {childrenOf(null).map(c => renderMoveNode(c, 0))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setMovingDef(null)} className="px-4 py-1.5 text-xs rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors">Cancel</button>
              <button onClick={confirmMove} className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors">Move</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
