'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/src/lib/supabase'
import { Mode, CabinetInstance } from './canvasTypes'
import { Room, CabinetDefinition } from '@/src/lib/types'
import RoomSwitcher, { type RoomSwitcherHandle } from './RoomSwitcher'

const CabinetPreview3D = dynamic(() => import('./CabinetPreview3D'), { ssr: false })

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

// ── Wall tools (unchanged) ──────────────────────────────────────────────────────

const WALL_ITEMS: { mode: Mode; label: string; icon: React.ReactNode; color: string }[] = [
  { mode: 'draw_wall',   label: 'Standard Wall', icon: <WallIcon />,   color: 'text-orange-400' },
  { mode: 'draw_island', label: 'Island',         icon: <IslandIcon />, color: 'text-yellow-400' },
]
const WALL_MODES = WALL_ITEMS.map(w => w.mode)

// ── DB-backed library types ─────────────────────────────────────────────────────

type Category = { id: string; name: string; sort_order: number; accent_color: string | null; parent_id: string | null }
type Scope    = 'all' | 'job'
type CabCtxMenu = { x: number; y: number; categoryId?: string | null; definitionId?: string }

// ── Component ─────────────────────────────────────────────────────────────────

export default function CanvasSidebar({
  room, onOpenRoomProperties, roomSwitcherRef,
  mode, onSelectMode,
  armedDefinitionId, onArmDefinition,
  wallMenuOpen, setWallMenuOpen,
  cabMenuOpen, setCabMenuOpen,
  benchtopMenuOpen, setBenchtopMenuOpen,
  clipboard, sidebarW, libRefresh = 0,
}: {
  room: Room
  onOpenRoomProperties: () => void
  roomSwitcherRef: React.Ref<RoomSwitcherHandle>
  mode: Mode
  onSelectMode: (m: Mode) => void
  armedDefinitionId: string | null
  onArmDefinition: (def: CabinetDefinition) => void
  wallMenuOpen: boolean
  setWallMenuOpen: (v: boolean) => void
  cabMenuOpen: boolean
  setCabMenuOpen: (v: boolean) => void
  benchtopMenuOpen: boolean
  setBenchtopMenuOpen: (v: boolean) => void
  clipboard: CabinetInstance | null
  sidebarW: number
  /** Bumped by the parent after a Save-to-library so the palette reloads. */
  libRefresh?: number
}) {
  function Btn({ target, icon, label, shortcut, activeClass = 'bg-blue-600 text-white' }: {
    target: Mode; icon: React.ReactNode; label: string; shortcut?: string; activeClass?: string
  }) {
    const active = mode === target
    return (
      <button
        title={shortcut ? `${label} (${shortcut})` : label}
        onClick={() => onSelectMode(target)}
        className={`w-full px-3 h-11 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors
          ${active ? activeClass : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'}`}
      >
        <span className="flex-none w-5 flex items-center justify-center">{icon}</span>
        <span className="flex-1 truncate text-left">{label}</span>
        {shortcut && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0
            ${active ? 'border-white/30 text-white/60' : 'border-gray-700 text-gray-600'}`}>
            {shortcut}
          </span>
        )}
      </button>
    )
  }

  // ── Library data (categories + definitions) ──
  const [categories, setCategories]     = useState<Category[]>([])
  const [definitions, setDefinitions]   = useState<CabinetDefinition[]>([])
  const [placedDefIds, setPlacedDefIds] = useState<Set<string>>(new Set())
  const [libError, setLibError]         = useState<string | null>(null)

  const [search, setSearch]   = useState('')
  const [scope, setScope]     = useState<Scope>('all')
  const [openCats, setOpenCats] = useState<Set<string>>(new Set())
  const [ctxMenu, setCtxMenu] = useState<CabCtxMenu | null>(null)
  const [movingDef, setMovingDef] = useState<CabinetDefinition | null>(null)
  const [moveTarget, setMoveTarget] = useState<string | null>(null)

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
  const benchtopActive = mode === 'draw_benchtop' || mode === 'draw_benchtop_rect' || mode === 'draw_benchtop_l' || mode === 'draw_benchtop_u' || mode === 'draw_benchtop_cutout_rect' || mode === 'draw_benchtop_cutout_circle'

  // A definition is visible if it passes the scope + search filters.
  const q = search.trim().toLowerCase()
  const matches = (d: CabinetDefinition) => {
    if (scope === 'job' && !placedDefIds.has(d.id)) return false
    if (q) return d.name.toLowerCase().includes(q)
    return true
  }
  const visibleCount = definitions.filter(matches).length
  const armedDef = definitions.find(d => d.id === armedDefinitionId) ?? null

  // ── Category tree ──
  const childrenOf = (parentId: string | null) =>
    categories.filter(c => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const defsOf = (catId: string) => definitions.filter(d => d.category_id === catId && matches(d))
  const orphanDefs = definitions.filter(d => matches(d) && !categories.some(c => c.id === d.category_id))
  // Does this node, or any descendant, have a visible definition? (search auto-expand)
  function nodeHasVisible(catId: string): boolean {
    return defsOf(catId).length > 0 || childrenOf(catId).some(c => nodeHasVisible(c.id))
  }

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
    if (!window.confirm(`Delete category “${cat.name}”?`)) return
    const { error } = await supabase.from('cabinet_categories').delete().eq('id', cat.id)
    if (error) setLibError(error.message); else await reloadCategories()
  }

  async function deleteDefinition(def: CabinetDefinition) {
    setCtxMenu(null)
    if (!window.confirm(`Delete “${def.name}” from the library?\nPlaced cabinets are unaffected.`)) return
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

  // Recursive accordion node: child categories then this node's definitions.
  function renderNode(cat: Category, depth: number): React.ReactNode {
    if (q && !nodeHasVisible(cat.id)) return null
    const defs = defsOf(cat.id)
    const kids = childrenOf(cat.id)
    const open = openCats.has(cat.id) || (!!q && nodeHasVisible(cat.id))
    const hasContent = kids.length > 0 || defs.length > 0
    return (
      <div key={cat.id} className="border-t border-gray-800">
        <button
          onClick={() => toggleCat(cat.id)}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, categoryId: cat.id }) }}
          className="w-full flex items-center gap-1.5 pr-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-colors"
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          <span className="w-3 text-[9px] opacity-60">{hasContent ? (open ? '▾' : '▸') : '·'}</span>
          <span className="flex-1 text-left truncate" style={cat.accent_color ? { color: cat.accent_color } : undefined}>{cat.name}</span>
          {defs.length > 0 && <span className="text-[10px] text-gray-600 normal-case">{defs.length}</span>}
        </button>
        {open && (
          <div className="flex flex-col">
            {kids.map(k => renderNode(k, depth + 1))}
            {defs.length > 0 && (
              <div className="divide-y divide-gray-800/60 border-t border-gray-800/60">
                {defs.map(def => {
                  const sel = armedDefinitionId === def.id
                  return (
                    <button
                      key={def.id}
                      onClick={() => onArmDefinition(def)}
                      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, definitionId: def.id }) }}
                      title={def.name}
                      className={`w-full flex items-center py-1.5 pr-2 text-sm transition-colors
                        ${sel ? 'bg-blue-600/20 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                      style={{ paddingLeft: 8 + (depth + 1) * 12 + 6 }}
                    >
                      <span className="flex-1 text-left truncate">{def.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
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
        <Btn target="select" icon={<SelectIcon />} label="Select" />

        <div className="border-t border-gray-800 my-1 mx-1" />

        {/* Wall dropdown */}
        <button
          title="Wall (F2)"
          onClick={() => setWallMenuOpen(!wallMenuOpen)}
          className={`w-full px-3 h-11 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors
            ${wallActive ? 'bg-orange-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'}`}
        >
          <span className="flex-none w-5 flex items-center justify-center"><WallIcon /></span>
          <span className="flex-1 truncate text-left">Wall</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0
            ${wallActive ? 'border-white/30 text-white/60' : 'border-gray-700 text-gray-600'}`}>
            F2
          </span>
          <span className="text-xs opacity-40">{wallMenuOpen ? '▴' : '▾'}</span>
        </button>

        {wallMenuOpen && (
          <div className="flex flex-col gap-px pt-0.5">
            {WALL_ITEMS.map(({ mode: m, label, icon, color }) => (
              <button
                key={m}
                onClick={() => { onSelectMode(m); setWallMenuOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors
                  ${mode === m ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              >
                <span className={`flex-none w-5 flex items-center justify-center ${mode === m ? 'text-white' : color}`}>
                  {icon}
                </span>
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-gray-800 my-1 mx-1" />

        {/* Cabinet library dropdown (DB-backed) */}
        <button
          title="Cabinet Library (F3)"
          onClick={() => setCabMenuOpen(!cabMenuOpen)}
          className={`w-full px-3 h-11 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors
            ${cabActive ? 'bg-blue-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'}`}
        >
          <span className="flex-none w-5 flex items-center justify-center"><CabinetIcon /></span>
          <span className="flex-1 truncate text-left">Cabinet</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0
            ${cabActive ? 'border-white/30 text-white/60' : 'border-gray-700 text-gray-600'}`}>
            F3
          </span>
          <span className="text-xs opacity-40">{cabMenuOpen ? '▴' : '▾'}</span>
        </button>

        {cabMenuOpen && (
          <div className="flex flex-col gap-1.5 pt-1">
            {libError && <p className="px-2 py-1.5 text-xs text-red-400">{libError}</p>}

            {/* Search + scope */}
            <div className="px-1 flex flex-col gap-1.5">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search cabinets…"
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
              />
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

            {/* Nested category tree → list rows. Right-click for New category / Rename / Delete. */}
            <div
              className="flex flex-col border-b border-gray-800 min-h-[40px]"
              onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, categoryId: null }) }}
            >
              {childrenOf(null).map(cat => renderNode(cat, 0))}

              {/* Definitions whose category was removed */}
              {orphanDefs.length > 0 && (
                <div className="border-t border-gray-800">
                  <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Uncategorised</div>
                  <div className="flex flex-col divide-y divide-gray-800/60 border-t border-gray-800/60">
                    {orphanDefs.map(def => {
                      const sel = armedDefinitionId === def.id
                      return (
                        <button key={def.id} onClick={() => onArmDefinition(def)}
                          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, definitionId: def.id }) }}
                          title={def.name}
                          className={`w-full flex items-center pl-4 pr-2 py-1.5 text-sm transition-colors
                            ${sel ? 'bg-blue-600/20 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}>
                          <span className="flex-1 text-left truncate">{def.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {categories.length === 0 && definitions.length === 0 && (
                <p className="px-2 py-2 text-xs text-gray-600 italic">Right-click to add a category.</p>
              )}
              {scope === 'job' && visibleCount === 0 && definitions.length > 0 && (
                <p className="px-2 py-2 text-xs text-gray-600 italic">No library cabinets placed in this job yet.</p>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-gray-800 my-1 mx-1" />

        {/* Benchtop dropdown */}
        <button
          title="Benchtop (F4)"
          onClick={() => setBenchtopMenuOpen(!benchtopMenuOpen)}
          className={`w-full px-3 h-11 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors
            ${benchtopActive ? 'bg-teal-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'}`}
        >
          <span className="flex-none w-5 flex items-center justify-center"><BenchtopIcon /></span>
          <span className="flex-1 truncate text-left">Benchtop</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0
            ${benchtopActive ? 'border-white/30 text-white/60' : 'border-gray-700 text-gray-600'}`}>
            F4
          </span>
          <span className="text-xs opacity-40">{benchtopMenuOpen ? '▴' : '▾'}</span>
        </button>

        {benchtopMenuOpen && (
          <div className="flex flex-col gap-px pt-0.5">
            <button
              onClick={() => { onSelectMode('draw_benchtop'); setBenchtopMenuOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors
                ${mode === 'draw_benchtop' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              <span className={`flex-none w-5 flex items-center justify-center ${mode === 'draw_benchtop' ? 'text-white' : 'text-teal-400'}`}>
                <BenchtopIcon />
              </span>
              <span className="truncate">Draw Polygon</span>
            </button>
            <button
              onClick={() => { onSelectMode('draw_benchtop_rect'); setBenchtopMenuOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors
                ${mode === 'draw_benchtop_rect' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              <span className={`flex-none w-5 flex items-center justify-center ${mode === 'draw_benchtop_rect' ? 'text-white' : 'text-teal-400'}`}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="12" height="8" rx="0.8" fill="currentColor" fillOpacity="0.12"/>
                </svg>
              </span>
              <span className="truncate">Draw Rectangle</span>
            </button>
            <button
              onClick={() => { onSelectMode('draw_benchtop_l'); setBenchtopMenuOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors
                ${mode === 'draw_benchtop_l' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              <span className={`flex-none w-5 flex items-center justify-center ${mode === 'draw_benchtop_l' ? 'text-white' : 'text-teal-400'}`}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 2 L2 14 L8 14 L8 8 L14 8 L14 2 Z" fill="currentColor" fillOpacity="0.12"/>
                </svg>
              </span>
              <span className="truncate">Draw L-Shape</span>
            </button>
            <button
              onClick={() => { onSelectMode('draw_benchtop_u'); setBenchtopMenuOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors
                ${mode === 'draw_benchtop_u' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              <span className={`flex-none w-5 flex items-center justify-center ${mode === 'draw_benchtop_u' ? 'text-white' : 'text-teal-400'}`}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 2 L2 14 L5 14 L5 8 L11 8 L11 14 L14 14 L14 2 Z" fill="currentColor" fillOpacity="0.12"/>
                </svg>
              </span>
              <span className="truncate">Draw U-Shape</span>
            </button>
            <div className="border-t border-gray-800 my-1 mx-1" />
            <button
              onClick={() => { onSelectMode('draw_benchtop_cutout_rect'); setBenchtopMenuOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors
                ${mode === 'draw_benchtop_cutout_rect' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              <span className={`flex-none w-5 flex items-center justify-center ${mode === 'draw_benchtop_cutout_rect' ? 'text-white' : 'text-red-400'}`}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="1" width="14" height="14" rx="1" fill="currentColor" fillOpacity="0.08"/>
                  <rect x="4" y="4" width="8" height="8" rx="0.5" fill="#111827" stroke="currentColor" strokeDasharray="2 1.5"/>
                </svg>
              </span>
              <span className="truncate">Rect Cutout</span>
            </button>
            <button
              onClick={() => { onSelectMode('draw_benchtop_cutout_circle'); setBenchtopMenuOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors
                ${mode === 'draw_benchtop_cutout_circle' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              <span className={`flex-none w-5 flex items-center justify-center ${mode === 'draw_benchtop_cutout_circle' ? 'text-white' : 'text-red-400'}`}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="1" width="14" height="14" rx="1" fill="currentColor" fillOpacity="0.08"/>
                  <circle cx="8" cy="8" r="4" fill="#111827" stroke="currentColor" strokeDasharray="2 1.5"/>
                </svg>
              </span>
              <span className="truncate">Circle Cutout</span>
            </button>
          </div>
        )}

        {clipboard && (
          <>
            <div className="border-t border-gray-800 my-1 mx-1" />
            <Btn
              target="paste"
              icon={<PasteIcon />}
              label={`Paste: ${clipboard.label ?? clipboard.assembly_class}`}
              activeClass="bg-yellow-700 text-white"
            />
          </>
        )}
      </div>

      {/* ── 3-D preview of the armed definition — pinned to the bottom ── */}
      {armedDef && (
        <div className="flex-none border-t border-gray-800 p-2">
          <CabinetPreview3D
            assemblyClass={armedDef.assembly_class}
            isEndPanel={false}
            label={armedDef.name}
            canvasWidth={sidebarW - 16}
          />
        </div>
      )}

      {/* ── Right-click menu (cabinet or category) ── */}
      {ctxMenu && (() => {
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
