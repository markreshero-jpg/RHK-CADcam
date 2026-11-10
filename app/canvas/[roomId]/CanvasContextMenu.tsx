'use client'
import { useLayoutEffect, useRef, useState } from 'react'
import { ContextMenuItem, ContextMenuSubItem } from './canvasTypes'

const COLOR = {
  red:   'text-red-400 hover:text-red-300',
  blue:  'text-blue-400 hover:text-blue-300',
  amber: 'text-amber-300 hover:text-amber-200',
}

function MenuItem({ item, btn, onClose }: { item: ContextMenuSubItem; btn: string; onClose: () => void }) {
  const [subOpen, setSubOpen] = useState(false)
  const subRef = useRef<HTMLDivElement>(null)
  // Keep the flyout on screen: shift it up if it runs past the bottom,
  // and open it to the left if there's no room on the right.
  useLayoutEffect(() => {
    const el = subRef.current
    if (!subOpen || !el) return
    el.style.top = '0px'
    el.style.left = ''
    el.style.right = ''
    const r = el.getBoundingClientRect()
    const overBottom = r.bottom - (window.innerHeight - 4)
    if (overBottom > 0) el.style.top = `${-Math.min(overBottom, r.top - 4)}px`
    if (r.right > window.innerWidth - 4) { el.style.left = 'auto'; el.style.right = '100%' }
  }, [subOpen])
  const colorCls = item.color ? COLOR[item.color] : 'text-gray-300 hover:text-white'

  if (item.children?.length) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <button
          disabled={item.disabled}
          className={`${btn} ${colorCls} justify-between`}
        >
          {item.label}
          <span className="ml-3 text-gray-500">›</span>
        </button>
        {subOpen && (
          <div
            ref={subRef}
            className="absolute left-full top-0 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[140px]"
            onPointerDown={e => e.stopPropagation()}
          >
            {item.children.map((sub, i) => <MenuItem key={i} item={sub} btn={btn} onClose={onClose} />)}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => { item.onClick?.(); onClose() }}
      disabled={item.disabled}
      className={`${btn} ${colorCls}`}
    >
      {item.label}
    </button>
  )
}

export default function CanvasContextMenu({ x, y, groups, onClose }: {
  x: number
  y: number
  groups: ContextMenuItem[][]
  onClose: () => void
}) {
  const btn = 'flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-700 disabled:text-gray-600 disabled:cursor-not-allowed'
  // Open downwards from the click when it fits; otherwise open upwards
  // (menu bottom at the click), and failing that pin it inside the window.
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight, pad = 4
    let top = y
    if (y + height > vh - pad) top = y - height >= pad ? y - height : Math.max(pad, vh - pad - height)
    let left = x
    if (x + width > vw - pad) left = Math.max(pad, vw - pad - width)
    setPos({ left, top })
  }, [x, y, groups])
  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      <div
        ref={menuRef}
        className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[180px]"
        style={{ left: pos.left, top: pos.top }}
        onPointerDown={e => e.stopPropagation()}
      >
        {groups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="my-1 border-t border-gray-700/60" />}
            {group.map((item, ii) =>
              item === null
                ? <div key={ii} className="my-1 border-t border-gray-700/60" />
                : <MenuItem key={ii} item={item} btn={btn} onClose={onClose} />
            )}
          </div>
        ))}
      </div>
    </>
  )
}
