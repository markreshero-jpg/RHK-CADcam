// Clashes to check (z_offline/OFFLINE-SPEC.md, step 1b): items someone else changed or
// deleted while this device had changes waiting. Last change won; these are the ones a
// person should look at. Open = resolved_at null.

import { create } from 'zustand'
import { supabase } from '@/src/lib/supabase'
import { outbox, type ClashRow } from './outbox'
import type { ClashKind } from './outboxCore'

export interface AnnotationClash {
  id: string
  room_id: string
  annotation_id: string
  kind: ClashKind
  my_op: 'upsert' | 'patch' | 'delete'
  theirs: (Record<string, unknown> & { id: string }) | null
  mine: Record<string, unknown> | null
  their_updated_at: string | null
  created_at: string
}

interface ClashState {
  roomId: string | null
  list: AnnotationClash[]
  open: boolean
  setOpen: (open: boolean) => void
  load: (roomId: string) => Promise<void>
  /** Mark it checked (saved through the offline queue, so it works with no signal). */
  resolve: (id: string) => void
}

export const useClashes = create<ClashState>((set, get) => ({
  roomId: null,
  list: [],
  open: false,
  setOpen: open => set({ open }),
  async load(roomId) {
    set({ roomId, list: [] })
    const { data, error } = await supabase.from('annotation_clashes').select('*')
      .eq('room_id', roomId).is('resolved_at', null).order('created_at')
    if (error) { console.error('[clashes load]', error); return }
    if (get().roomId === roomId) set({ list: (data ?? []) as AnnotationClash[] })
  },
  resolve(id) {
    const list = get().list.filter(c => c.id !== id)
    set({ list, open: list.length ? get().open : false })
    outbox.patch('annotation_clashes', id, { resolved_at: new Date().toISOString() })
  },
}))

// New clashes found while sending land in the list straight away.
outbox.onClashes((rows: ClashRow[]) => {
  const { roomId, list } = useClashes.getState()
  const mine = (rows as unknown as AnnotationClash[]).filter(r => r.room_id === roomId)
  if (mine.length) useClashes.setState({ list: [...list, ...mine] })
})
