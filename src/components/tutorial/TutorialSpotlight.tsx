'use client'

// ── Tutorial spotlight (z_tutorial) ───────────────────────────────────────────
// A pulsing ring around the element tagged data-tour={target} ("a|b" = first
// one found). Follows it every
// frame (sidebars open / close, panels resize). pointer-events: none, so the
// click the step asks for goes straight through to the real control.

import { useEffect, useState } from 'react'

type Box = { x: number; y: number; w: number; h: number }

export default function TutorialSpotlight({ target }: { target: string }) {
  const [box, setBox] = useState<Box | null>(null)

  useEffect(() => {
    let raf = 0
    let last = ''
    const tick = () => {
      // "a|b": ring the first one on screen (a tool row, else its collapsed section).
      let next: Box | null = null
      for (const id of target.split('|')) {
        const r = document.querySelector<HTMLElement>(`[data-tour="${id}"]`)?.getBoundingClientRect()
        if (r && r.width > 0 && r.height > 0) { next = { x: r.left, y: r.top, w: r.width, h: r.height }; break }
      }
      const key = next ? `${next.x},${next.y},${next.w},${next.h}` : ''
      if (key !== last) { last = key; setBox(next) }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [target])

  if (!box) return null
  const pad = 4
  return (
    <div
      aria-hidden
      className="fixed z-[60] pointer-events-none rounded-lg ring-2 ring-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.25)] animate-pulse"
      style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2 }}
    />
  )
}
