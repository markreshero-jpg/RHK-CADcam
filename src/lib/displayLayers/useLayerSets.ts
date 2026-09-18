'use client'
// Shop-wide layer sets (drawing_layer_sets). Every set is editable.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { LayerSet, LayerSetSettings } from './registry'

type Row = { id: string; name: string; sort_order: number; settings: LayerSetSettings | null }

const toSet = (r: Row): LayerSet => ({
  id: r.id, name: r.name, sort_order: r.sort_order, settings: r.settings ?? {},
})

export interface LayerSetsApi {
  sets:    LayerSet[]            // by sort_order, then name
  loading: boolean
  error:   string | null
  create(name: string, settings: LayerSetSettings): Promise<LayerSet | null>
  update(id: string, patch: { name?: string; settings?: LayerSetSettings }): Promise<boolean>
  remove(id: string): Promise<boolean>
}

export function useLayerSets(): LayerSetsApi {
  const [rows, setRows]       = useState<LayerSet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('drawing_layer_sets').select('id, name, sort_order, settings')
      .then(({ data, error: e }) => {
        if (cancelled) return
        if (e) setError(e.message)
        else setRows((data as Row[]).map(toSet))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const create = useCallback(async (name: string, settings: LayerSetSettings) => {
    const sort_order = rows.reduce((m, s) => Math.max(m, s.sort_order), -1) + 1
    const { data, error: e } = await supabase.from('drawing_layer_sets')
      .insert({ name, settings, sort_order }).select('id, name, sort_order, settings').single()
    if (e || !data) { setError(e?.message ?? 'Create failed'); return null }
    const set = toSet(data as Row)
    setRows(prev => [...prev, set])
    setError(null)
    return set
  }, [rows])

  const update = useCallback(async (id: string, patch: { name?: string; settings?: LayerSetSettings }) => {
    const { error: e } = await supabase.from('drawing_layer_sets')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (e) { setError(e.message); return false }
    setRows(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
    setError(null)
    return true
  }, [])

  const remove = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('drawing_layer_sets').delete().eq('id', id)
    if (e) { setError(e.message); return false }
    setRows(prev => prev.filter(s => s.id !== id))
    setError(null)
    return true
  }, [])

  const sets = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  return { sets, loading, error, create, update, remove }
}
