'use client'
import { useEffect, useRef } from 'react'
import { MenuGroup } from './canvasTypes'

type MenuItem = NonNullable<MenuGroup['items'][number]>

// Phones get one "Menu" button listing every group (z_mobile/MOBILE-SPEC.md).
const COMPACT_MENU = '__all__'

function ItemButton({ item, onDone, big }: { item: MenuItem; onDone: () => void; big?: boolean }) {
  return (
    <button disabled={item.disabled}
      onClick={() => { item.action?.(); onDone() }}
      className={`flex w-full items-center gap-2 px-3 ${big ? 'py-2.5 text-sm' : 'py-1.5 text-xs'} text-gray-300 hover:bg-gray-700 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed`}
    >
      <span className={`w-3 text-center shrink-0 ${item.checked ? 'text-blue-400' : 'text-transparent'}`}>✓</span>
      <span className="flex-1 text-left">{item.label}</span>
      {item.shortcut && !big && <span className="text-gray-500 text-[10px]">{item.shortcut}</span>}
    </button>
  )
}

export default function CanvasMenubar({ projectName, roomName, openMenu, setOpenMenu, menus, compact }: {
  projectName: string
  roomName: string
  openMenu: string | null
  setOpenMenu: (v: string | null) => void
  menus: MenuGroup[]
  compact?: boolean
}) {
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const handler = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('pointerdown', handler, { capture: true })
    return () => document.removeEventListener('pointerdown', handler, { capture: true })
  }, [openMenu, setOpenMenu])

  if (compact) {
    return (
      <nav
        ref={navRef}
        className="relative flex-none h-10 bg-gray-900 border-b border-gray-800 flex items-stretch text-sm select-none"
        onPointerDown={e => e.stopPropagation()}
      >
        <button
          data-tour="menu-File"
          className={`px-3 border-r border-gray-800 transition-colors ${openMenu === COMPACT_MENU ? 'bg-blue-600 text-white' : 'text-gray-300'}`}
          onClick={() => setOpenMenu(openMenu === COMPACT_MENU ? null : COMPACT_MENU)}
        >
          Menu ▾
        </button>
        <div className="flex-1 min-w-0 flex items-center px-3 text-gray-400 truncate">
          <span className="truncate">{projectName} / {roomName}</span>
        </div>
        {openMenu === COMPACT_MENU && (
          <div className="absolute left-0 right-0 top-full z-50 bg-gray-800 border-b border-gray-700 shadow-xl py-1 max-h-[75vh] overflow-y-auto">
            {menus.map(menu => (
              <div key={menu.label} className="pb-1">
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-500">{menu.label}</div>
                {menu.items.map((item, i) => item === null
                  ? null
                  : <ItemButton key={item.label + i} item={item} big onDone={() => setOpenMenu(null)} />)}
              </div>
            ))}
          </div>
        )}
      </nav>
    )
  }

  return (
    <nav
      ref={navRef}
      className="flex-none h-8 bg-gray-900 border-b border-gray-800 flex items-stretch text-xs select-none"
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="flex items-center px-3 border-r border-gray-800 font-semibold text-gray-200 whitespace-nowrap">
        RHK CADcam
      </div>
      <div className="flex items-center px-3 border-r border-gray-800 text-gray-500 whitespace-nowrap">
        {projectName} / {roomName}
      </div>
      {menus.map(menu => (
        <div key={menu.label} className="relative">
          <button
            data-tour={`menu-${menu.label}`}
            className={`h-full px-3 text-xs transition-colors ${openMenu === menu.label ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
          >
            {menu.label}
          </button>
          {openMenu === menu.label && (
            <div className="absolute left-0 top-full z-50 bg-gray-800 border border-gray-700 rounded-b shadow-xl py-1 min-w-[190px]">
              {menu.items.map((item, i) =>
                item === null
                  ? <div key={i} className="my-1 border-t border-gray-700/60" />
                  : <ItemButton key={item.label} item={item} onDone={() => setOpenMenu(null)} />
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}
