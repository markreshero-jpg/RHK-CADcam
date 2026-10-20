'use client'

// Joins the online-users presence channel for this tab and keeps its page
// current — see src/lib/presence.ts. Renders nothing.

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { startPresence, setPresencePath } from '@/src/lib/presence'

export default function PresenceTracker() {
  const pathname = usePathname()

  useEffect(() => startPresence(() => window.location.pathname), [])
  useEffect(() => { setPresencePath(pathname) }, [pathname])

  return null
}
