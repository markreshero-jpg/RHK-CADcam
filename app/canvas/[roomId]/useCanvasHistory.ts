import { useRef, useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { Wall, CabinetInstance } from '@/src/lib/types'
import type { Selected } from './canvasTypes'

type Snapshot = { walls: Wall[]; cabinets: CabinetInstance[] }

export function useCanvasHistory(
  walls: Wall[],
  cabinets: CabinetInstance[],
  setWalls: React.Dispatch<React.SetStateAction<Wall[]>>,
  setCabinets: React.Dispatch<React.SetStateAction<CabinetInstance[]>>,
  setSelected: (s: Selected) => void,
) {
  const undoStackRef = useRef<Snapshot[]>([])
  const redoStackRef = useRef<Snapshot[]>([])
  const wallsRef     = useRef<Wall[]>(walls)
  const cabinetsRef  = useRef<CabinetInstance[]>(cabinets)
  const [version, setVersion] = useState(0) // bump to surface canUndo/canRedo changes

  useEffect(() => { wallsRef.current    = walls    }, [walls])
  useEffect(() => { cabinetsRef.current = cabinets }, [cabinets])

  function captureSnapshot() {
    undoStackRef.current = [...undoStackRef.current.slice(-49), { walls: wallsRef.current, cabinets: cabinetsRef.current }]
    redoStackRef.current = []
    setVersion(v => v + 1)
  }

  async function applySnapshot(snap: Snapshot) {
    const pw = wallsRef.current
    const pc = cabinetsRef.current
    setWalls(snap.walls); setCabinets(snap.cabinets); setSelected(null)

    const pwMap = new Map(pw.map(w => [w.id, w]))
    const swMap = new Map(snap.walls.map(w => [w.id, w]))
    for (const w of pw) {
      if (!swMap.has(w.id)) {
        await supabase.from('cabinet_instances').delete().eq('wall_id', w.id)
        await supabase.from('walls').delete().eq('id', w.id)
      }
    }
    const newWalls = snap.walls.filter(w => !pwMap.has(w.id))
    if (newWalls.length) await supabase.from('walls').insert(newWalls)
    for (const w of snap.walls) {
      const p = pwMap.get(w.id)
      if (p && JSON.stringify(p) !== JSON.stringify(w)) await supabase.from('walls').update(w).eq('id', w.id)
    }

    const pcMap = new Map(pc.map(c => [c.id, c]))
    const scMap = new Map(snap.cabinets.map(c => [c.id, c]))
    for (const c of pc) {
      if (!scMap.has(c.id)) await supabase.from('cabinet_instances').delete().eq('id', c.id)
    }
    const newCabs = snap.cabinets.filter(c => !pcMap.has(c.id))
    if (newCabs.length) await supabase.from('cabinet_instances').insert(newCabs)
    for (const c of snap.cabinets) {
      const p = pcMap.get(c.id)
      if (p && JSON.stringify(p) !== JSON.stringify(c)) await supabase.from('cabinet_instances').update(c).eq('id', c.id)
    }
  }

  async function handleUndo() {
    if (!undoStackRef.current.length) return
    const snap = undoStackRef.current[undoStackRef.current.length - 1]
    redoStackRef.current = [...redoStackRef.current, { walls: wallsRef.current, cabinets: cabinetsRef.current }]
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    setVersion(v => v + 1)
    await applySnapshot(snap)
  }

  async function handleRedo() {
    if (!redoStackRef.current.length) return
    const snap = redoStackRef.current[redoStackRef.current.length - 1]
    undoStackRef.current = [...undoStackRef.current, { walls: wallsRef.current, cabinets: cabinetsRef.current }]
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    setVersion(v => v + 1)
    await applySnapshot(snap)
  }

  return {
    captureSnapshot,
    handleUndo,
    handleRedo,
    wallsRef,
    cabinetsRef,
    canUndo: version >= 0 && undoStackRef.current.length > 0,
    canRedo: version >= 0 && redoStackRef.current.length > 0,
  }
}
