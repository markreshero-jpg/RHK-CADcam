'use client'

// The edit window frame shared by the cabinet editor (CabinetEditModal) and the
// benchtop editor (BenchtopEditModal) — Mark 2026-11-27: "can we use the same
// window?". Backdrop, header (title / size / status / ✕), tab bar with a
// right-hand toolbar, the view area, and the w-72 properties panel on the right
// (a slide-out drawer with an edge tab on phones). Each editor supplies its own
// tabs, views and panel.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import PhoneDrawerTab from './PhoneDrawerTab'
import { useIsPhone } from '@/src/lib/usePhone'

export interface ShellTab<T extends string = string> {
  id: T
  label: string
  disabled?: boolean
  /** Count shown after the label, e.g. "Errors (2)". 0 / absent = none. */
  badge?: number
  /** Red tab (errors present). */
  error?: boolean
}

export default function EditModalShell<T extends string>({
  onClose, title, subtitle, status, tabs, activeTab, onTab, toolbar, aboveContent, beside,
  contentClassName, onContentClick, children, panel, panelHidden, onTogglePanel, after,
}: {
  onClose: () => void
  title: ReactNode
  /** Mono text after the title (sizes). */
  subtitle?: ReactNode
  /** Small italic notes after the subtitle (resolving…, stale data). */
  status?: ReactNode
  tabs: ShellTab<T>[]
  activeTab: T
  onTab: (id: T) => void
  /** Buttons on the right of the tab bar. */
  toolbar?: ReactNode
  /** A bar between the tabs and the view area (the CAD bar). */
  aboveContent?: ReactNode
  /** Left of the view area (the CAD ribbon). */
  beside?: ReactNode
  contentClassName?: string
  onContentClick?: () => void
  /** The active view. */
  children: ReactNode
  /** Contents of the right-hand properties panel (the w-72 column). */
  panel: ReactNode
  /** Phones: the properties drawer is shut. */
  panelHidden: boolean
  onTogglePanel: () => void
  /** Overlays drawn over the whole window (part editor, floating CAD panels). */
  after?: ReactNode
}) {
  const phone = useIsPhone()
  // The phone drawer starts below the header + tabs so it never covers the close ✕.
  const contentRef = useRef<HTMLDivElement>(null)
  const [drawerTop, setDrawerTop] = useState(0)
  useEffect(() => {
    const el = contentRef.current
    if (!phone || !el) return
    const ro = new ResizeObserver(() => setDrawerTop(el.offsetTop))
    ro.observe(el)
    return () => ro.disconnect()
  }, [phone])

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center touch-no-select ${phone ? '' : 'p-4'}`}
      onPointerDown={onClose}
    >
      <div
        className={phone
          ? 'relative flex w-full h-dvh bg-gray-900 overflow-hidden'
          : 'flex w-full h-full max-w-7xl max-h-[92vh] bg-gray-900 rounded-xl shadow-2xl overflow-hidden'}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Left: view tabs + canvas */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* Header */}
          <div className={`flex-none bg-gray-800 border-b border-gray-700 py-2 flex items-center justify-between gap-2 ${phone ? 'pl-3 pr-1.5' : 'px-4'}`}>
            <div className={`flex items-baseline gap-3 min-w-0 ${phone ? 'overflow-hidden whitespace-nowrap' : ''}`}>
              <span className="text-sm font-medium text-gray-200">{title}</span>
              {subtitle != null && <span className="text-xs text-gray-500 font-mono">{subtitle}</span>}
              {status}
            </div>
            {phone ? (
              <button onClick={onClose} title="Close" aria-label="Close"
                className="flex-none w-9 h-9 rounded-lg flex items-center justify-center border border-gray-600 bg-gray-700/60 text-gray-200 active:bg-gray-600">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            ) : (
              <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none px-1">✕</button>
            )}
          </div>
          {/* Tabs */}
          <div className={`flex-none bg-gray-800/60 border-b border-gray-700 py-1.5 flex items-center gap-1 ${phone ? 'px-2 overflow-x-auto [&>*]:shrink-0' : 'px-4'}`}>
            {tabs.map(v => {
              const badge = v.badge ?? 0
              const isErr = !!v.error
              return (
                <button
                  key={v.id}
                  onClick={() => !v.disabled && onTab(v.id)}
                  disabled={v.disabled}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    activeTab === v.id
                      ? (isErr ? 'bg-red-600 text-white' : 'bg-blue-600 text-white')
                      : v.disabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : isErr
                      ? 'text-red-400 hover:text-red-300 hover:bg-gray-700'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  {v.label}{badge > 0 ? ` (${badge})` : ''}
                </button>
              )
            })}
            {toolbar && <div className="ml-auto flex items-center gap-1.5">{toolbar}</div>}
          </div>
          {aboveContent}
          <div className="flex-1 flex min-h-0">
          {beside}
          {/* Content */}
          <div
            ref={contentRef}
            className={`flex-1 min-w-0 overflow-hidden relative ${contentClassName ?? ''}`}
            onClick={onContentClick}
          >
            {children}
          </div>
          </div>
        </div>

        {/* Right: properties panel. Phone: a drawer sliding via `right` (not a
            transform — that would trap the fixed menus rendered inside), with an edge tab. */}
        <div className={phone ? 'absolute bottom-0 z-20 flex items-start transition-[right] duration-200' : 'contents'}
          style={phone ? { top: drawerTop, right: panelHidden ? 'calc(-1 * min(20rem, 86vw))' : 0 } : undefined}>
        {phone && <PhoneDrawerTab hidden={panelHidden} onToggle={onTogglePanel} />}
        <div className={phone
          ? 'h-full w-[min(20rem,86vw)] bg-gray-900 border-l border-gray-700 shadow-2xl relative [&_.w-72]:w-full! [&_.w-72]:border-l-0'
          : 'flex-none w-72 border-l border-gray-800 relative'}>
          {panel}
        </div>
        </div>
      </div>

      {after}
    </div>
  )
}
