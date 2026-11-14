'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { useOutboxStatus, outbox } from '@/src/lib/offline/outbox'
import { clearOfflineCopies } from '@/src/lib/offline/roomCache'

export function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    // Offline (z_offline): changes still waiting would be lost; room copies + cached reads
    // belong to this login, so they go.
    const waiting = useOutboxStatus.getState().pending
    if (waiting && !window.confirm(`${waiting} change${waiting === 1 ? ' is' : 's are'} still waiting to send (no signal). Sign out anyway and lose ${waiting === 1 ? 'it' : 'them'}?`)) return
    await outbox.discardAll()
    await clearOfflineCopies()
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-ink-subtle hover:text-ink-muted text-sm px-3 py-2 rounded-lg hover:bg-surface-2 transition-colors"
    >
      Sign out
    </button>
  )
}
