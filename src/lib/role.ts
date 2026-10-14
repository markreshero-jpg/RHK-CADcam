// Current user's access role (user_roles table). Admins have full access;
// testers only reach the jobs listed for them in project_access and can't edit
// the library / shop settings. The database enforces this (RLS) — role checks
// in the app only hide UI a tester can't use. See
// z_access_control/ACCESS-CONTROL-SPEC.md. Client components: useIsAdmin().

import type { SupabaseClient } from '@supabase/supabase-js'

export type UserRole = 'admin' | 'tester'

/** Role of the signed-in user; anything unknown is treated as 'tester'. */
export async function fetchRole(client: SupabaseClient): Promise<UserRole> {
  const { data: { user } } = await client.auth.getUser()
  if (!user) return 'tester'
  const { data } = await client.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role === 'admin' ? 'admin' : 'tester'
}
