import { createServerClient } from '@/src/lib/supabase-server'
import CabinetsLibraryClient from './CabinetsLibraryClient'

export const dynamic = 'force-dynamic'

export default async function CabinetsLibraryPage() {
  const supabase = await createServerClient()

  const [cats, defs] = await Promise.all([
    supabase.from('cabinet_categories').select('*').order('sort_order'),
    supabase.from('cabinet_definitions').select('*').order('sort_order'),
  ])

  return (
    <CabinetsLibraryClient
      initialCategories={(cats.data ?? []) as Record<string, unknown>[]}
      initialDefinitions={(defs.data ?? []) as Record<string, unknown>[]}
    />
  )
}
