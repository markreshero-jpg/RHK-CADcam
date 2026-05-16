import { createServerClient } from '@/src/lib/supabase-server'
import MaterialsClient from './MaterialsClient'

export const dynamic = 'force-dynamic'

export default async function MaterialsPage() {
  const supabase = createServerClient()

  const [boards, bands, benchtops, hinges, handles, slides] = await Promise.all([
    supabase.from('materials').select('*').order('name'),
    supabase.from('edge_banding').select('*').order('name'),
    supabase.from('benchtop_materials').select('*').order('name'),
    supabase.from('hardware_hinges').select('*').order('name'),
    supabase.from('hardware_handles').select('*').order('name'),
    supabase.from('hardware_slides').select('*').order('name'),
  ])

  return (
    <MaterialsClient
      initialData={{
        board:     (boards.data    ?? []) as Record<string, unknown>[],
        edgeband:  (bands.data     ?? []) as Record<string, unknown>[],
        benchtop:  (benchtops.data ?? []) as Record<string, unknown>[],
        hinges:    (hinges.data    ?? []) as Record<string, unknown>[],
        handles:   (handles.data   ?? []) as Record<string, unknown>[],
        slides:    (slides.data    ?? []) as Record<string, unknown>[],
      }}
    />
  )
}
