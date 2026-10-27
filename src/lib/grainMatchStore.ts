'use client'
// Grain match groups per room (z_grain_match), shared by the canvas (which edits
// them — useGrainMatch) and every view / print that draws the grain_match layer.
import { useEffect } from 'react'
import { create } from 'zustand'
import { supabase } from './supabase'
import type { GrainMatchGroup } from './grainMatch'

interface GrainMatchStore {
  byRoom: Record<string, GrainMatchGroup[]>
  setRoom: (roomId: string, groups: GrainMatchGroup[] | ((gs: GrainMatchGroup[]) => GrainMatchGroup[])) => void
}

export const useGrainMatchStore = create<GrainMatchStore>(set => ({
  byRoom: {},
  setRoom: (roomId, groups) => set(s => ({
    byRoom: { ...s.byRoom, [roomId]: typeof groups === 'function' ? groups(s.byRoom[roomId] ?? []) : groups },
  })),
}))

const loading = new Set<string>()
const EMPTY: GrainMatchGroup[] = []

/** The room's groups; loads them once when nothing has (e.g. a report opened on its own). */
export function useGrainMatchGroups(roomId: string | null | undefined): GrainMatchGroup[] {
  const groups = useGrainMatchStore(s => (roomId ? s.byRoom[roomId] : undefined))
  useEffect(() => {
    if (!roomId || groups || loading.has(roomId)) return
    loading.add(roomId)
    void supabase.from('grain_match_groups').select('*').eq('room_id', roomId).then(({ data }) => {
      loading.delete(roomId)
      if (!useGrainMatchStore.getState().byRoom[roomId]) useGrainMatchStore.getState().setRoom(roomId, (data ?? []) as GrainMatchGroup[])
    })
  }, [roomId, groups])
  return groups ?? EMPTY
}
