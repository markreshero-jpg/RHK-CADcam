// Client-side role check — see role.ts.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { fetchRole, type UserRole } from './role'

let cached: Promise<UserRole> | null = null
if (typeof window !== 'undefined') supabase.auth.onAuthStateChange(() => { cached = null })

/** true / false once known, null while loading. Admin-only UI should render
 *  only when this is true. */
export function useIsAdmin(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    cached ??= fetchRole(supabase)
    cached.then(r => { if (live) setIsAdmin(r === 'admin') })
    return () => { live = false }
  }, [])
  return isAdmin
}
