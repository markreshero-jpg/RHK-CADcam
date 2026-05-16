import { createServerClient } from '@/src/lib/supabase-server'
import SchedulesClient from './SchedulesClient'

export const dynamic = 'force-dynamic'

export default async function SchedulesPage() {
  const supabase = createServerClient()

  const [mats, shopMains, shopTk] = await Promise.all([
    supabase.from('materials').select('id, name, dz').eq('active', true).order('name'),
    supabase.from('shop_material_defaults').select('assembly_class, material_role, material_id'),
    supabase.from('shop_toekick_materials').select('part_role, material_id'),
  ])

  return (
    <SchedulesClient
      allMaterials={(mats.data ?? []) as { id: string; name: string; dz: number }[]}
      shopMains={(shopMains.data ?? []) as { assembly_class: string; material_role: string; material_id: string }[]}
      shopTk={(shopTk.data ?? []) as { part_role: string; material_id: string }[]}
    />
  )
}
