'use client'

import { useState } from 'react'

// Generic floating snap-control button. Used by both the plan canvas and the
// elevation canvas — each passes its own kinds + metadata + settings, so the
// component itself is view-agnostic.
//
// `K` is the union of valid snap kinds for the caller's view. `settings` must
// carry a master `enabled` flag plus a per-kind boolean map.
export interface SnapToolbarSettings<K extends string> {
  enabled: boolean
  kinds:   Record<K, boolean>
}

export default function SnapToolbar<K extends string>({
  settings,
  onChange,
  kinds,
  meta,
}: {
  settings: SnapToolbarSettings<K>
  onChange: (s: SnapToolbarSettings<K>) => void
  kinds:    readonly K[]
  meta:     Record<K, { label: string; color: string }>
}) {
  const [open, setOpen] = useState(false)

  const toggleMaster = () => onChange({ ...settings, enabled: !settings.enabled })
  const toggleKind = (k: K) =>
    onChange({ ...settings, kinds: { ...settings.kinds, [k]: !settings.kinds[k] } })

  return (
    <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1 select-none">
      <button
        onClick={() => setOpen(o => !o)}
        title="Snap settings"
        className={`w-8 h-8 rounded flex items-center justify-center text-base border shadow-lg transition-colors ${
          settings.enabled
            ? 'bg-blue-600/90 border-blue-400 text-white'
            : 'bg-gray-800/90 border-gray-600 text-gray-500'
        }`}
      >
        🧲
      </button>

      {open && (
        <div className="bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl p-2 w-44 backdrop-blur-sm">
          <div className="flex items-center justify-between px-1 pb-1.5 mb-1.5 border-b border-gray-700">
            <span className="text-xs font-medium text-gray-200">Snapping</span>
            <button
              onClick={toggleMaster}
              title={settings.enabled ? 'Disable all snapping' : 'Enable snapping'}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                settings.enabled ? 'bg-blue-500' : 'bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${
                  settings.enabled ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          <div className={`flex flex-col gap-0.5 ${settings.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
            {kinds.map(k => {
              const on = settings.kinds[k]
              const { label, color } = meta[k]
              return (
                <button
                  key={k}
                  onClick={() => toggleKind(k)}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-xs text-left transition-colors ${
                    on ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm border shrink-0"
                    style={{ borderColor: color, background: on ? color : 'transparent' }}
                  />
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
