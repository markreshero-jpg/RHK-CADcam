'use client'
import { useState } from 'react'
import { ContextMenuItem } from './canvasTypes'

const COLOR = {
  red:   'text-red-400 hover:text-red-300',
  blue:  'text-blue-400 hover:text-blue-300',
  amber: 'text-amber-300 hover:text-amber-200',
}

type NonNull = Extract<ContextMenuItem, { label: string }>

function MenuItem({ item, btn, onClose }: { item: NonNull; btn: string; onClose: () => void }) {
  const [subOpen, setSubOpen] = useState(false)
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
            className="absolute left-full top-0 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[140px]"
            onPointerDown={e => e.stopPropagation()}
          >
            {item.children.map((sub, i) => (
              <button
                key={i}
                onClick={() => { sub.onClick(); onClose() }}
                disabled={sub.disabled}
                className={`${btn} ${sub.color ? COLOR[sub.color] : 'text-gray-300 hover:text-white'}`}
              >
                {sub.label}
              </button>
            ))}
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
  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      <div
        className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[180px]"
        style={{ left: x, top: y }}
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
