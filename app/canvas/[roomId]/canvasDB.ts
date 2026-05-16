import { supabase } from '@/src/lib/supabase'
import type { Wall, CabinetInstance } from '@/src/lib/types'

export async function dbSaveWall(data: Omit<Wall, 'id' | 'created_at'>): Promise<Wall | null> {
  const { data: row, error } = await supabase.from('walls').insert(data).select().single()
  if (error) { console.error(error); return null }
  return row as Wall
}

export async function dbUpdateWall(id: string, u: Partial<Wall>) {
  const { error } = await supabase.from('walls').update(u).eq('id', id)
  if (error) console.error(error)
}

export async function dbDeleteWall(id: string) {
  const { error } = await supabase.from('walls').delete().eq('id', id)
  if (error) console.error('dbDeleteWall', error)
}

export async function dbSaveCabinet(
  data: Omit<CabinetInstance, 'id' | 'created_at' | 'updated_at'>,
): Promise<CabinetInstance | null> {
  const { data: row, error } = await supabase.from('cabinet_instances').insert(data).select().single()
  if (error) { console.error(error); return null }
  return row as CabinetInstance
}

export async function dbUpdateCabinet(id: string, u: Partial<CabinetInstance>) {
  const { error } = await supabase.from('cabinet_instances').update(u).eq('id', id)
  if (error) console.error(error)
}

export async function dbDeleteCabinet(id: string) {
  const { error } = await supabase.from('cabinet_instances').delete().eq('id', id)
  if (error) console.error('dbDeleteCabinet', error)
}
