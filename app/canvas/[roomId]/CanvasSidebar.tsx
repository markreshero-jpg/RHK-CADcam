'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Mode, CabinetInstance, modeAssemblyClass } from './canvasTypes'

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

const BaseCabIcon   = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <rect x="1.5" y="4" width="13" height="10" rx="0.8"/>
    <line x1="8" y1="4" x2="8" y2="14"/>
    <line x1="5.5" y1="9.5" x2="6.5" y2="9.5" strokeWidth="1.8"/>
    <line x1="9.5" y1="9.5" x2="10.5" y2="9.5" strokeWidth="1.8"/>
    <rect x="1.5" y="13" width="13" height="2.5" rx="0.5" fill="currentColor" fillOpacity="0.3"/>
  </svg>
)

const WallUnitIcon  = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <rect x="1.5" y="2" width="13" height="9" rx="0.8"/>
    <line x1="8" y1="2" x2="8" y2="11"/>
    <line x1="5.5" y1="7" x2="6.5" y2="7" strokeWidth="1.8"/>
    <line x1="9.5" y1="7" x2="10.5" y2="7" strokeWidth="1.8"/>
  </svg>
)

const TallCabIcon   = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <rect x="3.5" y="1" width="9" height="14" rx="0.8"/>
    <line x1="8" y1="1" x2="8" y2="15"/>
    <line x1="5.5" y1="5" x2="6.5" y2="5" strokeWidth="1.8"/>
    <line x1="9.5" y1="5" x2="10.5" y2="5" strokeWidth="1.8"/>
    <line x1="5.5" y1="11" x2="6.5" y2="11" strokeWidth="1.8"/>
    <line x1="9.5" y1="11" x2="10.5" y2="11" strokeWidth="1.8"/>
  </svg>
)

const EndPanelIcon  = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <rect x="5" y="2" width="6" height="12" rx="0.8"/>
    <line x1="2" y1="8" x2="5" y2="8" strokeDasharray="1.5 1.5"/>
  </svg>
)

const CornerIcon    = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 2 L9 2 L9 9 L2 9 Z" opacity="0.5"/>
    <path d="M9 2 L14 2 L14 14 L2 14 L2 9" strokeDasharray="2 1.5"/>
  </svg>
)

// ── Data ──────────────────────────────────────────────────────────────────────

const WALL_ITEMS: { mode: Mode; label: string; icon: React.ReactNode; color: string }[] = [
  { mode: 'draw_wall',   label: 'Standard Wall', icon: <WallIcon />,   color: 'text-orange-400' },
  { mode: 'draw_island', label: 'Island',         icon: <IslandIcon />, color: 'text-yellow-400' },
]
const WALL_MODES = WALL_ITEMS.map(w => w.mode)

type CabItem = { mode: Mode; label: string; icon: React.ReactNode; color: string }
type CabGroup = { label: string; accentClass: string; items: CabItem[] }

const CAB_GROUPS: CabGroup[] = [
  {
    label: 'Base', accentClass: 'text-blue-400',
    items: [
      { mode: 'place_base',        label: 'Base Cabinet', icon: <BaseCabIcon />,  color: 'text-blue-400' },
      { mode: 'place_base_corner', label: 'Base Corner',  icon: <CornerIcon />,   color: 'text-blue-300' },
      { mode: 'place_end_panel',   label: 'End Panel',    icon: <EndPanelIcon />, color: 'text-slate-400' },
    ],
  },
  {
    label: 'Wall', accentClass: 'text-emerald-400',
    items: [
      { mode: 'place_wall_unit',   label: 'Wall Unit',    icon: <WallUnitIcon />, color: 'text-emerald-400' },
      { mode: 'place_wall_corner', label: 'Wall Corner',  icon: <CornerIcon />,   color: 'text-emerald-300' },
    ],
  },
  {
    label: 'Tall', accentClass: 'text-purple-400',
    items: [
      { mode: 'place_tall',        label: 'Tall Cabinet', icon: <TallCabIcon />,  color: 'text-purple-400' },
      { mode: 'place_tall_corner', label: 'Tall Corner',  icon: <CornerIcon />,   color: 'text-purple-300' },
    ],
  },
]

const ALL_CAB_ITEMS = CAB_GROUPS.flatMap(g => g.items)
const PLACE_MODES   = ALL_CAB_ITEMS.map(c => c.mode)

// ── Component ─────────────────────────────────────────────────────────────────

export default function CanvasSidebar({
  mode, onSelectMode,
  wallMenuOpen, setWallMenuOpen,
  cabMenuOpen, setCabMenuOpen,
  benchtopMenuOpen, setBenchtopMenuOpen,
  clipboard, sidebarW,
}: {
  mode: Mode
  onSelectMode: (m: Mode) => void
  wallMenuOpen: boolean
  setWallMenuOpen: (v: boolean) => void
  cabMenuOpen: boolean
  setCabMenuOpen: (v: boolean) => void
  benchtopMenuOpen: boolean
  setBenchtopMenuOpen: (v: boolean) => void
  clipboard: CabinetInstance | null
  sidebarW: number
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

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  function toggleGroup(label: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label); else next.add(label)
      return next
    })
  }

  const [customGroupLabels, setCustomGroupLabels] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('rhk-cab-groups') ?? '[]') } catch { return [] }
  })
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number
    groupLabel?: string
    subGroup?: { label: string; parent: string }
  } | null>(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [customSubGroups, setCustomSubGroups] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem('rhk-cab-subgroups') ?? '{}') } catch { return {} }
  })
  const [addingSubGroup, setAddingSubGroup] = useState<string | null>(null)
  const [newSubGroupName, setNewSubGroupName] = useState('')

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [ctxMenu])

  function saveCustomGroups(labels: string[]) {
    localStorage.setItem('rhk-cab-groups', JSON.stringify(labels))
    setCustomGroupLabels(labels)
  }

  function handleAddGroup() {
    const name = newGroupName.trim()
    if (!name) return
    if (CAB_GROUPS.some(g => g.label === name) || customGroupLabels.includes(name)) return
    saveCustomGroups([...customGroupLabels, name])
    setNewGroupName('')
    setAddingGroup(false)
  }

  function handleDeleteGroup(label: string) {
    saveCustomGroups(customGroupLabels.filter(l => l !== label))
    setCtxMenu(null)
  }

  function saveSubGroups(groups: Record<string, string[]>) {
    localStorage.setItem('rhk-cab-subgroups', JSON.stringify(groups))
    setCustomSubGroups(groups)
  }

  function handleAddSubGroup() {
    if (!addingSubGroup) return
    const name = newSubGroupName.trim()
    if (!name) return
    const existing = customSubGroups[addingSubGroup] ?? []
    if (existing.includes(name)) return
    saveSubGroups({ ...customSubGroups, [addingSubGroup]: [...existing, name] })
    setNewSubGroupName('')
    setAddingSubGroup(null)
  }

  function handleDeleteSubGroup(parent: string, label: string) {
    const existing = customSubGroups[parent] ?? []
    saveSubGroups({ ...customSubGroups, [parent]: existing.filter(l => l !== label) })
    setCtxMenu(null)
  }

  const allGroups: CabGroup[] = [
    ...CAB_GROUPS,
    ...customGroupLabels.map(label => ({ label, accentClass: 'text-gray-400', items: [] as CabItem[] })),
  ]

  const cabActive       = PLACE_MODES.includes(mode)
  const wallActive      = WALL_MODES.includes(mode)
  const benchtopActive  = mode === 'draw_benchtop' || mode === 'draw_benchtop_rect'

  const previewItem = cabActive ? ALL_CAB_ITEMS.find(c => c.mode === mode) : null
  const previewMac  = cabActive ? modeAssemblyClass(mode) : null

  return (
    <aside
      className="flex-none bg-gray-900 flex flex-col border-r border-gray-800"
      style={{ width: sidebarW }}
      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
    >
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

        {/* Cabinet dropdown */}
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
          <div className="flex flex-col gap-px pt-0.5">
            {allGroups.map(group => {
              const isCustom = customGroupLabels.includes(group.label)
              const groupActive = group.items.some(i => i.mode === mode)
              const isOpen = openGroups.has(group.label) || groupActive
              const subs = customSubGroups[group.label] ?? []
              return (
                <div key={group.label}>
                  <button
                    onClick={() => toggleGroup(group.label)}
                    onContextMenu={e => { e.stopPropagation(); e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, groupLabel: group.label }) }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors
                      ${groupActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    <span className={`flex-1 text-left ${groupActive ? group.accentClass : ''}`}>{group.label}</span>
                    {isCustom && <span className="text-[9px] text-gray-600 normal-case font-normal tracking-normal italic mr-1">custom</span>}
                    <span className="opacity-40 text-[10px]">{isOpen ? '▴' : '▾'}</span>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-px pb-1">
                      {group.items.map(({ mode: m, label, icon, color }) => (
                        <button
                          key={m}
                          onClick={() => onSelectMode(m)}
                          className={`w-full flex items-center gap-2.5 pl-5 pr-3 py-2 rounded-md text-sm transition-colors
                            ${mode === m ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                        >
                          <span className={`flex-none w-4 flex items-center justify-center ${mode === m ? 'text-white' : color}`}>
                            {icon}
                          </span>
                          <span className="truncate">{label}</span>
                        </button>
                      ))}

                      {subs.map(subLabel => {
                        const subKey = `${group.label}::${subLabel}`
                        const subOpen = openGroups.has(subKey)
                        return (
                          <div key={subLabel}>
                            <button
                              onClick={() => toggleGroup(subKey)}
                              onContextMenu={e => { e.stopPropagation(); e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, subGroup: { label: subLabel, parent: group.label } }) }}
                              className="w-full flex items-center gap-2 pl-5 pr-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors text-gray-600 hover:text-gray-400"
                            >
                              <span className="flex-1 text-left">{subLabel}</span>
                              <span className="opacity-40 text-[10px]">{subOpen ? '▴' : '▾'}</span>
                            </button>
                            {subOpen && (
                              <p className="pl-8 pr-3 py-1.5 text-xs text-gray-600 italic">No items yet</p>
                            )}
                          </div>
                        )
                      })}

                      {addingSubGroup === group.label && (
                        <div className="pl-5 pr-2 py-1">
                          <input
                            autoFocus
                            value={newSubGroupName}
                            onChange={e => setNewSubGroupName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleAddSubGroup()
                              if (e.key === 'Escape') { setAddingSubGroup(null); setNewSubGroupName('') }
                            }}
                            placeholder="Sub-category name…"
                            className="w-full bg-gray-800 border border-gray-600 rounded-md px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
                          />
                        </div>
                      )}

                      {group.items.length === 0 && subs.length === 0 && addingSubGroup !== group.label && (
                        <p className="pl-5 pr-3 py-1.5 text-xs text-gray-600 italic">No items yet</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {addingGroup && (
              <div className="px-2 py-1.5">
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddGroup()
                    if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') }
                  }}
                  placeholder="Category name…"
                  className="w-full bg-gray-800 border border-gray-600 rounded-md px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
                />
              </div>
            )}
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

      {/* ── 3-D preview — pinned to the bottom of the sidebar ── */}
      {previewItem && previewMac && (
        <div className="flex-none border-t border-gray-800 p-2">
          <CabinetPreview3D
            assemblyClass={previewMac.cls}
            isEndPanel={previewMac.ep}
            label={previewItem.label}
            canvasWidth={sidebarW - 16}
          />
        </div>
      )}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[170px] text-sm"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={e => e.stopPropagation()}
          onContextMenu={e => e.preventDefault()}
        >
          {ctxMenu.subGroup ? (
            <button
              onClick={() => handleDeleteSubGroup(ctxMenu.subGroup!.parent, ctxMenu.subGroup!.label)}
              className="w-full text-left px-3 py-2 text-red-400 hover:bg-gray-700 rounded-md"
            >
              Delete &ldquo;{ctxMenu.subGroup.label}&rdquo;
            </button>
          ) : ctxMenu.groupLabel ? (
            <>
              <button
                onClick={() => {
                  if (!openGroups.has(ctxMenu.groupLabel!)) toggleGroup(ctxMenu.groupLabel!)
                  setAddingSubGroup(ctxMenu.groupLabel!)
                  setCtxMenu(null)
                }}
                className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700 rounded-md"
              >
                + Add sub-category
              </button>
              {customGroupLabels.includes(ctxMenu.groupLabel) && (
                <button
                  onClick={() => handleDeleteGroup(ctxMenu.groupLabel!)}
                  className="w-full text-left px-3 py-2 text-red-400 hover:bg-gray-700 rounded-md"
                >
                  Delete &ldquo;{ctxMenu.groupLabel}&rdquo;
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => { setAddingGroup(true); setCtxMenu(null) }}
              className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700 rounded-md"
            >
              + Add Category
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
