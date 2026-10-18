'use client'

// ── Tutorial host (z_tutorial) ────────────────────────────────────────────────
// Mounted once in the root layout so the panel survives page changes (lesson 1
// runs on Projects → New Project → canvas). Feeds the route into the tutorial
// ctx; the canvas feeds the drawing (CanvasClient).

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useTutorial } from '@/src/lib/tutorial/store'
import { LESSONS } from '@/src/lib/tutorial/lessons'
import TutorialPanel from './TutorialPanel'
import TutorialSpotlight from './TutorialSpotlight'

export default function TutorialHost() {
  const path = usePathname() ?? ''
  const enabled   = useTutorial(s => s.enabled)
  const lesson    = useTutorial(s => s.lesson)
  const step      = useTutorial(s => s.step)
  const spotlight = useTutorial(s => s.spotlight)

  useEffect(() => { useTutorial.getState().load() }, [])
  useEffect(() => {
    useTutorial.getState().setCtx({ path, inCanvas: path.startsWith('/canvas/') })
  }, [path])

  if (!enabled || path.startsWith('/login')) return null
  const target = LESSONS[lesson]?.steps[step]?.target
  return (
    <>
      <TutorialPanel />
      {spotlight && target && <TutorialSpotlight target={target} />}
    </>
  )
}
