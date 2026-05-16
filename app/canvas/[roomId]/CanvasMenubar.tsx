'use client'
import { MenuGroup } from './canvasTypes'

export default function CanvasMenubar({ projectName, roomName, openMenu, setOpenMenu, menus }: {
  projectName: string
  roomName: string
  openMenu: string | null
  setOpenMenu: (v: string | null) => void
  menus: MenuGroup[]
}) {
  return (
    <nav
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
            className={`h-full px-3 text-xs transition-colors ${openMenu === menu.label ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
          >
            {menu.label}
          </button>
          {openMenu === menu.label && (
            <div className="absolute left-0 top-full z-50 bg-gray-800 border border-gray-700 rounded-b shadow-xl py-1 min-w-[190px]">
              {menu.items.map((item, i) =>
                item === null ? (
                  <div key={i} className="my-1 border-t border-gray-700/60" />
                ) : (
                  <button key={item.label} disabled={item.disabled}
                    onClick={() => { item.action?.(); setOpenMenu(null) }}
                    className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed"
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="text-gray-500 text-[10px]">{item.shortcut}</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}
