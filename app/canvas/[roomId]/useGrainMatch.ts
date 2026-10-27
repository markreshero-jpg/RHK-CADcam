import { useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance, Wall } from '@/src/lib/types'
import {
  grainArrow, grainMatchBlocker, nextGrainMatchName,
  type GrainMatchDirection, type GrainMatchGroup,
} from '@/src/lib/grainMatch'
import { useGrainMatchStore } from '@/src/lib/grainMatchStore'
import { useTutorial } from '@/src/lib/tutorial/store'
import type { ContextMenuItem, ContextMenuSubItem } from './canvasTypes'

// Grain match groups (z_grain_match G1): load the room's groups and build the
// right-click items. Removing cabinets only clears their grain_match_group_id —
// the group row stays so an undo that restores a member's row still points at a
// real group; groups left with no members are swept when the room loads.

interface GrainMatchParams {
  roomId:         string
  walls:          Wall[]
  cabinets:       CabinetInstance[]
  setCabinets:    React.Dispatch<React.SetStateAction<CabinetInstance[]>>
  setContextMenu: (v: null) => void
  setToast:       (msg: string) => void
}

export function useGrainMatch({ roomId, walls, cabinets, setCabinets, setContextMenu, setToast }: GrainMatchParams) {
  const groups = useGrainMatchStore(s => s.byRoom[roomId]) ?? []
  const setGroups = (gs: GrainMatchGroup[] | ((gs: GrainMatchGroup[]) => GrainMatchGroup[])) => useGrainMatchStore.getState().setRoom(roomId, gs)

  useEffect(() => {
    let live = true
    void (async () => {
      const [{ data: gs }, { data: used }] = await Promise.all([
        supabase.from('grain_match_groups').select('*').eq('room_id', roomId).order('created_at'),
        supabase.from('cabinet_instances').select('grain_match_group_id').eq('room_id', roomId).not('grain_match_group_id', 'is', null),
      ])
      const usedIds = new Set((used ?? []).map(r => r.grain_match_group_id as string))
      const all = (gs ?? []) as GrainMatchGroup[]
      const empty = all.filter(g => !usedIds.has(g.id)).map(g => g.id)
      if (empty.length) await supabase.from('grain_match_groups').delete().in('id', empty)
      if (live) useGrainMatchStore.getState().setRoom(roomId, all.filter(g => usedIds.has(g.id)))
    })()
    return () => { live = false }
  }, [roomId])

  async function setMembers(ids: string[], groupId: string | null) {
    const { error } = await supabase.from('cabinet_instances').update({ grain_match_group_id: groupId }).in('id', ids)
    if (error) { console.error('grain match', error); setToast('Grain match failed — see console'); return false }
    setCabinets(cs => cs.map(c => ids.includes(c.id) ? { ...c, grain_match_group_id: groupId } : c))
    return true
  }

  async function createGroup(ids: string[], direction: GrainMatchDirection) {
    setContextMenu(null)
    const name = nextGrainMatchName(groups)
    const { data, error } = await supabase.from('grain_match_groups')
      .insert({ room_id: roomId, name, direction }).select().single()
    if (error || !data) { console.error('grain match', error); setToast('Grain match failed — see console'); return }
    setGroups(gs => [...gs, data as GrainMatchGroup])
    if (await setMembers(ids, data.id)) {
      setToast(`${name} ${grainArrow(direction)} — ${ids.length} cabinet${ids.length > 1 ? 's' : ''} grain matched`)
      useTutorial.getState().emit('grain_match_create')   // tutorial grain_match
    }
  }

  async function setDirection(group: GrainMatchGroup, direction: GrainMatchDirection) {
    setContextMenu(null)
    const { error } = await supabase.from('grain_match_groups').update({ direction }).eq('id', group.id)
    if (error) { console.error('grain match', error); setToast('Grain match failed — see console'); return }
    setGroups(gs => gs.map(g => g.id === group.id ? { ...g, direction } : g))
    setToast(`${group.name} ${grainArrow(direction)} ${direction}`)
    useTutorial.getState().emit('grain_match_direction')   // tutorial grain_match
  }

  async function removeMembers(group: GrainMatchGroup, ids: string[]) {
    setContextMenu(null)
    if (!await setMembers(ids, null)) return
    // An emptied group stays in state too (numbering + undo); the next load sweeps it.
    const left = cabinets.filter(c => c.grain_match_group_id === group.id && !ids.includes(c.id)).length
    setToast(left ? `${ids.length} removed from ${group.name}` : `${group.name} removed`)
  }

  async function addMembers(group: GrainMatchGroup, ids: string[]) {
    setContextMenu(null)
    if (await setMembers(ids, group.id)) setToast(`${ids.length} added to ${group.name}`)
  }

  /** Right-click items for the cabinet `cabId`, acting on `ids` (the selection holding it, else just it). */
  function menuItems(cabId: string, ids: string[]): ContextMenuItem[] {
    const cab = cabinets.find(c => c.id === cabId)
    if (!cab) return []
    const picked = cabinets.filter(c => ids.includes(c.id))
    const group = cab.grain_match_group_id ? groups.find(g => g.id === cab.grain_match_group_id) : undefined

    if (group) {
      const members = cabinets.filter(c => c.grain_match_group_id === group.id)
      const outsiders = picked.filter(c => c.grain_match_group_id !== group.id)
      const inPicked = picked.filter(c => c.grain_match_group_id === group.id).map(c => c.id)
      const other: GrainMatchDirection = group.direction === 'vertical' ? 'horizontal' : 'vertical'
      const children: ContextMenuSubItem[] = [
        { label: `Switch to ${other} ${grainArrow(other)}`, onClick: () => void setDirection(group, other) },
      ]
      if (outsiders.length) {
        const why = grainMatchBlocker([...members, ...outsiders], walls)
        children.push(why
          ? { label: `Add ${outsiders.length} to ${group.name} — ${why}`, disabled: true }
          : { label: `Add ${outsiders.length} to ${group.name}`, onClick: () => void addMembers(group, outsiders.map(c => c.id)) })
      }
      children.push(
        { label: inPicked.length > 1 ? `Remove ${inPicked.length} from ${group.name}` : `Remove from ${group.name}`, onClick: () => void removeMembers(group, inPicked) },
        { label: `Remove ${group.name} (${members.length} cabinet${members.length > 1 ? 's' : ''})`, color: 'red', onClick: () => void removeMembers(group, members.map(c => c.id)) },
      )
      return [{ label: `Grain match ${group.name} ${grainArrow(group.direction)} ${group.direction}`, color: 'amber', children }]
    }

    const why = grainMatchBlocker(picked, walls)
    if (why) return [{ label: `Grain match — ${why}`, disabled: true }]
    return [{
      label: picked.length > 1 ? `Grain match (${picked.length})` : 'Grain match',
      color: 'amber',
      children: [
        { label: `Vertical ${grainArrow('vertical')}`, onClick: () => void createGroup(ids, 'vertical') },
        { label: `Horizontal ${grainArrow('horizontal')}`, onClick: () => void createGroup(ids, 'horizontal') },
      ],
    }]
  }

  return { grainMatchGroups: groups, grainMatchMenuItems: menuItems }
}
