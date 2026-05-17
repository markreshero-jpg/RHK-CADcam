import { createServerClient } from '@/src/lib/supabase-server'
import JointsClient from './JointsClient'

export const dynamic = 'force-dynamic'

export default async function JointsPage() {
  const supabase = createServerClient()

  const [joints, fasteners] = await Promise.all([
    supabase.from('joint_types').select('*').order('name'),
    supabase.from('hardware_fasteners').select('*').order('name'),
  ])

  return (
    <JointsClient
      initialJoints={(joints.data ?? []) as Record<string, unknown>[]}
      initialFasteners={(fasteners.data ?? []) as Record<string, unknown>[]}
    />
  )
}
