'use client'

// Plan-view Edit shape (z_cabinet_shape_edit E3): right-click a cabinet → Edit
// shape. Its footprint is highlighted on the plan; click an edge to set its type
// / sub-type, a corner to set how the pieces meet (side panel). Changes write
// straight through (the parts re-resolve live, as from the cabinet panel); the
// first change takes one canvas undo snapshot, so the whole edit is one Ctrl+Z
// after Done. Ctrl+Z inside the edit steps back one change; Cancel restores the
// footprint the edit started from. A plain cabinet starts from a rectangle
// footprint and stays plain unless something is changed.

import { useCallback, useRef, useState } from 'react'
import type { CabinetInstance } from '@/src/lib/types'
import type { Footprint } from '@/src/lib/cabinetShape/footprint'
import { rectangleFootprint } from '@/src/lib/cabinetShape/edit'

/** The cabinet fields an edit can change (E4b: drawing the outline moves / resizes the box). */
export type ShapeCabSnap = Pick<CabinetInstance, 'footprint' | 'dx' | 'dz' | 'pos_x' | 'pos_y'>
const snapOf = (c: CabinetInstance): ShapeCabSnap => ({ footprint: c.footprint ?? null, dx: c.dx, dz: c.dz, pos_x: c.pos_x, pos_y: c.pos_y })

export type ShapeEditSel = { kind: 'edge'; id: string } | { kind: 'corner'; key: string } | null

export interface CabinetShapeEdit {
  cabId: string
  /** The footprint as it was when the edit started (null = a plain box). */
  orig: Footprint | null
  /** The cabinet's footprint / box / position when the edit started (Cancel puts it back). */
  origCab: ShapeCabSnap
  /** What the edit is working on (the cabinet's footprint, or the rectangle start). */
  fp: Footprint
  /** Earlier states inside this edit, for Ctrl+Z. */
  history: { fp: Footprint; cab: ShapeCabSnap }[]
  sel: ShapeEditSel
  hover: ShapeEditSel
}

export function useCabinetShapeEdit({ cabinets, onUpdate, captureSnapshot }: {
  cabinets: CabinetInstance[]
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  captureSnapshot: () => void
}) {
  const [edit, setEdit] = useState<CabinetShapeEdit | null>(null)
  const editRef = useRef(edit)
  editRef.current = edit

  /** Begin editing a cabinet's shape. Returns false when it can't be shape-edited. */
  const start = useCallback((cabId: string) => {
    const cab = cabinets.find(c => c.id === cabId)
    if (!cab) return false
    const orig = cab.footprint?.segments?.length ? cab.footprint : null
    setEdit({ cabId, orig, origCab: snapOf(cab), fp: orig ?? rectangleFootprint({ w: cab.dx, d: cab.dz }), history: [], sel: null, hover: null })
    return true
  }, [cabinets])

  const cabsRef = useRef(cabinets)
  cabsRef.current = cabinets

  /** Apply a footprint change (write-through); `extra` = a new box / position (E4b). */
  const apply = useCallback((next: Footprint, extra: Partial<CabinetInstance> = {}) => {
    const e = editRef.current
    const cab = cabsRef.current.find(c => c.id === e?.cabId)
    if (!e || !cab) return
    if (!e.history.length) captureSnapshot()
    const was = { ...snapOf(cab), footprint: e.history.length ? e.fp : cab.footprint ?? null }
    setEdit({ ...e, fp: next, history: [...e.history, { fp: e.fp, cab: was }] })
    void onUpdate(e.cabId, { footprint: next, ...extra })
  }, [captureSnapshot, onUpdate])

  const undo = useCallback(() => {
    const e = editRef.current
    if (!e?.history.length) return
    const prev = e.history[e.history.length - 1]
    const history = e.history.slice(0, -1)
    setEdit({ ...e, fp: prev.fp, history })
    // Back to where it started: a plain box goes back to no footprint.
    void onUpdate(e.cabId, history.length ? prev.cab : e.origCab)
  }, [onUpdate])

  /** Finish, keeping the changes. Returns the cabinet id. */
  const done = useCallback(() => {
    const e = editRef.current
    setEdit(null)
    return e?.cabId ?? null
  }, [])

  /** Finish, putting the footprint back as it was. Returns the cabinet id. */
  const cancel = useCallback(() => {
    const e = editRef.current
    setEdit(null)
    if (e?.history.length) void onUpdate(e.cabId, e.origCab)
    return e?.cabId ?? null
  }, [onUpdate])

  const setSel = useCallback((sel: ShapeEditSel) => setEdit(e => (e ? { ...e, sel } : e)), [])
  const setHover = useCallback((hover: ShapeEditSel) => setEdit(e => (e ? { ...e, hover } : e)), [])

  return { edit, start, apply, undo, done, cancel, setSel, setHover }
}

/** Cabinets whose shape the edit mode can change: carcass cabinets built from a
 *  footprint (not kicks, curved ends, bulkheads, floating shelves, back panels). */
export function shapeEditable(cab: CabinetInstance | undefined): boolean {
  return !!cab && !!cab.has_carcass && !cab.is_kick_assembly && !cab.curved_end && !cab.bulkhead
    && !cab.float_shelf && !cab.back_panel
}
