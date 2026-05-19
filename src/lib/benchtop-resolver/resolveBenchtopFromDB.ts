import { supabase } from '@/src/lib/supabase'
import { loadBenchtopInput } from './loadBenchtopInput'
import { resolveBenchtopParts } from './resolver'
import type { ResolvedBenchtopPart } from './types'

export async function resolveBenchtopFromDB(benchtopId: string): Promise<ResolvedBenchtopPart[] | null> {
  const input = await loadBenchtopInput(benchtopId)
  if (!input) return null

  const parts = resolveBenchtopParts(input)

  // Replace resolved parts for this benchtop
  await supabase.from('benchtop_resolved_parts').delete().eq('benchtop_id', benchtopId)

  if (parts.length > 0) {
    const rows = parts.map(p => ({ ...p, benchtop_id: benchtopId }))
    const { error } = await supabase.from('benchtop_resolved_parts').insert(rows)
    if (error) console.error('Failed to persist benchtop parts:', error)
  }

  return parts
}

export async function loadResolvedParts(benchtopId: string): Promise<ResolvedBenchtopPart[]> {
  const { data } = await supabase
    .from('benchtop_resolved_parts')
    .select('*')
    .eq('benchtop_id', benchtopId)
    .order('part_role')
  return (data ?? []) as ResolvedBenchtopPart[]
}
