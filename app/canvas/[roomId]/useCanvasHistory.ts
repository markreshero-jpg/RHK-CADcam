import { useRef, useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { Wall, CabinetInstance, BenchtopInstance } from '@/src/lib/types'
import type { Selected } from './canvasTypes'

type Snapshot = { walls: Wall[]; cabinets: CabinetInstance[]; benchtops: BenchtopInstance[] }

export function useCanvasHistory(
  walls: Wall[],
  cabinets: CabinetInstance[],
  benchtops: BenchtopInstance[],
  setWalls: React.Dispatch<React.SetStateAction<Wall[]>>,
  setCabinets: React.Dispatch<React.SetStateAction<CabinetInstance[]>>,
  setBenchtops: React.Dispatch<React.SetStateAction<BenchtopInstance[]>>,
  setSelected: (s: Selected) => void,
) {
  const undoStackRef   = useRef<Snapshot[]>([])
  const redoStackRef   = useRef<Snapshot[]>([])
  const wallsRef       = useRef<Wall[]>(walls)
  const cabinetsRef    = useRef<CabinetInstance[]>(cabinets)
  const benchtopsRef   = useRef<BenchtopInstance[]>(benchtops)
  const [version, setVersion] = useState(0)

  useEffect(() => { wallsRef.current     = walls     }, [walls])
  useEffect(() => { cabinetsRef.current  = cabinets  }, [cabinets])
  useEffect(() => { benchtopsRef.current = benchtops }, [benchtops])

  function captureSnapshot() {
    undoStackRef.current = [...undoStackRef.current.slice(-49), {
      walls: wallsRef.current,
      cabinets: cabinetsRef.current,
      benchtops: benchtopsRef.current,
    }]
    redoStackRef.current = []
    setVersion(v => v + 1)
  }

  async function applySnapshot(snap: Snapshot) {
    const pw = wallsRef.current
    const pc = cabinetsRef.current
    const pb = benchtopsRef.current
    setWalls(snap.walls); setCabinets(snap.cabinets); setBenchtops(snap.benchtops); setSelected(null)

    // Sync walls
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

    // Sync cabinets
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

    // Sync benchtops
    const pbMap = new Map(pb.map(b => [b.id, b]))
    const sbMap = new Map(snap.benchtops.map(b => [b.id, b]))
    for (const b of pb) {
      if (!sbMap.has(b.id)) await supabase.from('benchtop_instances').delete().eq('id', b.id)
    }
    const newBts = snap.benchtops.filter(b => !pbMap.has(b.id))
    if (newBts.length) await supabase.from('benchtop_instances').insert(newBts)
    for (const b of snap.benchtops) {
      const p = pbMap.get(b.id)
      if (p && JSON.stringify(p) !== JSON.stringify(b)) await supabase.from('benchtop_instances').update(b).eq('id', b.id)
    }
  }

  async function handleUndo() {
    if (!undoStackRef.current.length) return
    const snap = undoStackRef.current[undoStackRef.current.length - 1]
    redoStackRef.current = [...redoStackRef.current, { walls: wallsRef.current, cabinets: cabinetsRef.current, benchtops: benchtopsRef.current }]
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    setVersion(v => v + 1)
    await applySnapshot(snap)
  }

  async function handleRedo() {
    if (!redoStackRef.current.length) return
    const snap = redoStackRef.current[redoStackRef.current.length - 1]
    undoStackRef.current = [...undoStackRef.current, { walls: wallsRef.current, cabinets: cabinetsRef.current, benchtops: benchtopsRef.current }]
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    setVersion(v => v + 1)
    await applySnapshot(snap)
  }

  // Push an explicit pre-captured snapshot (used by drag operations that need to
  // record the pre-drag state, not the current state at the time of commit).
  function pushSnapshot(snap: Snapshot) {
    undoStackRef.current = [...undoStackRef.current.slice(-49), snap]
    redoStackRef.current = []
    setVersion(v => v + 1)
  }

  return {
    captureSnapshot,
    pushSnapshot,
    handleUndo,
    handleRedo,
    wallsRef,
    cabinetsRef,
    benchtopsRef,
    canUndo: version >= 0 && undoStackRef.current.length > 0,
    canRedo: version >= 0 && redoStackRef.current.length > 0,
  }
}
