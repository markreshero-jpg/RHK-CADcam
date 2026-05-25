'use client'

import { useEffect, useState } from 'react'

const SunIcon = () => (
  <svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="7.5" r="3" />
    <path d="M7.5 1v1.5M7.5 13v1.5M1 7.5h1.5M12.5 7.5H14M3 3l1.1 1.1M10.9 10.9 12 12M12 3l-1.1 1.1M4.1 10.9 3 12" />
  </svg>
)

const MoonIcon = () => (
  <svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 8.5A5.5 5.5 0 0 1 6.5 2a5.5 5.5 0 1 0 6.5 6.5Z" />
  </svg>
)

/**
 * Sliding light/dark switch. Reads the theme the no-flash script already applied
 * to <html>, flips the class, and persists the choice to localStorage.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark')
    setMounted(true)
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(next)
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* localStorage unavailable — theme still applies for this session */
    }
    setTheme(next)
  }

  const isLight = mounted && theme === 'light'

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isLight}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-edge-strong bg-surface-2 transition-colors ${className}`}
    >
      <span
        suppressHydrationWarning
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface text-ink-muted shadow-sm transition-transform duration-200 ${isLight ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      >
        {isLight ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  )
}
