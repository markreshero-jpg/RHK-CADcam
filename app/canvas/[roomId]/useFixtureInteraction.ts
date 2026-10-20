'use client'

// ── Fixture placement + editing (z_fixtures P2) ───────────────────────────────
// F6 opens the Fixtures sidebar section. Picking a catalogue item "carries" it:
// the ghost follows the cursor, backs onto the nearest wall face (Shift = free),
// R turns it 90° while free, click drops it (one drop, then Select). Move re-uses the same carry. Works in plan and in elevation.
// Placed rows copy the catalogue item (jobs stay as-built).
//
// Same shape as useBenchtopInteraction: direct supabase calls, optimistic state,
// captureSnapshot before every change so Ctrl+Z covers fixtures.

import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { Room, Wall, FixtureCatalogItem, RoomFixture, FixtureBody } from '@/src/lib/types'
import { centroid, type Pt } from '@/src/lib/geometry'
import { stretchBounds, stretchPatch, type StretchSide, type StretchBounds } from '@/src/lib/fixtureGeometry'
import { fixtureWallRef, fixtureAxes } from '@/src/lib/fixtureGeometry'
import { stretchedCutout } from '@/src/lib/fixtureStretch'
import { snapFixture, snapOpening, defaultFixtureZ, sitsOnCabinets, fixtureCenter, backLeftForCenter, type FixtureSnap, type FixtureFootprint } from '@/src/lib/fixtureGeometry'
import type { FixtureLink } from '@/src/lib/fixtureLinks'
import type { Mode, Selected } from './canvasTypes'

/** How far (mm) from a wall face the cursor can be and still snap to it. */
const SNAP_REACH = 600

/** An edge being stretched (P7): the pose at the start, the side, its limits. */
export interface FixtureStretch {
  id:     string
  side:   StretchSide
  base:   RoomFixture
  bounds: StretchBounds
  /** Size rounding: 1 in plan, 10 in elevation (like cabinets). */
  step:   number
}

export type FixtureCarry =
  | { kind: 'place'; item: FixtureCatalogItem }
  | { kind: 'move'; id: string }

const BODY_KEYS: (keyof FixtureBody)[] = [
  'category', 'kind', 'name', 'brand', 'model_no', 'width', 'depth', 'height', 'mount', 'colour',
  'model_url', 'model_format', 'model_scale', 'model_rot_x', 'model_rot_y',
  'model_off_x', 'model_off_y', 'model_off_z',
  'cutout_shape', 'cutout_w', 'cutout_d', 'cutout_radius', 'cutout_off_x', 'cutout_off_y', 'cut_benchtop', 'bench_drop',
  'plan_shape', 'elev_shape', 'resizable', 'stretch',
]

export function bodyFromCatalog(item: FixtureCatalogItem): FixtureBody {
  const out = {} as Record<string, unknown>
  for (const k of BODY_KEYS) out[k] = item[k]
  return out as unknown as FixtureBody
}

export function useFixtureInteraction({
  room, walls, fixtures, setFixtures, mode, setMode, selected, setSelected, captureSnapshot, benchTopAt, linkAt, clearOf, onDropped,
}: {
  room:          Room
  walls:         Wall[]
  fixtures:      RoomFixture[]
  setFixtures:   React.Dispatch<React.SetStateAction<RoomFixture[]>>
  /** P3: top height of the benchtop under a plan point, or null when there's none. */
  benchTopAt?:   (p: Pt) => number | null
  /** P4: the cabinet link for a pose (the cabinet it's dropped over), or null. */
  linkAt?:       (f: FixtureFootprint & { mount: RoomFixture['mount']; category: RoomFixture['category'] }) => FixtureLink | null
  /** Slide a wall-snapped item clear of cabinets / other appliances (nearest free gap), like a cabinet. */
  clearOf?:      (s: FixtureSnap, body: { id?: string; width: number; depth: number; height: number; z: number }) => FixtureSnap
  /** After a drop (place / move): seat it in an open cell of the cabinet it linked to.
   *  `cursorZ` = cursor height above the floor when dropped in elevation. */
  onDropped?:    (f: RoomFixture, cursorZ?: number) => void
  mode:          Mode
  setMode:       (m: Mode) => void
  selected:      Selected
  setSelected:   (s: Selected) => void
  captureSnapshot: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [carry,    setCarry]    = useState<FixtureCarry | null>(null)
  const [ghost,    setGhost]    = useState<FixtureSnap | null>(null)
  const [freeRot,  setFreeRot]  = useState(0)
  const [error,    setError]    = useState<string | null>(null)
  const [stretch,  setStretch]  = useState<FixtureStretch | null>(null)
  // Key handlers in CanvasClient bind with stale closures — read fixtures fresh.
  const fixturesRef = useRef(fixtures)
  fixturesRef.current = fixtures

  const carried: Pick<RoomFixture, 'category' | 'kind' | 'name' | 'width' | 'depth' | 'height'> | null =
    carry?.kind === 'place' ? carry.item
    : carry?.kind === 'move' ? fixtures.find(f => f.id === carry.id) ?? null
    : null
  /** Underside height the ghost is drawn at in elevation (where it will land, before any benchtop fit). */
  const carriedZ: number =
    carry?.kind === 'place'
      ? defaultFixtureZ(carry.item.mount, carry.item.mount_height) - (carry.item.mount === 'benchtop' ? Number(carry.item.bench_drop) || 0 : 0)
      : carry?.kind === 'move' ? Number(fixtures.find(f => f.id === carry.id)?.z) || 0 : 0

  const arm = useCallback((item: FixtureCatalogItem) => {
    setCarry({ kind: 'place', item })
    setGhost(null)
    setMode('place_fixture')
  }, [setMode])

  const startMove = useCallback((id: string) => {
    const f = fixturesRef.current.find(x => x.id === id)
    if (!f) return
    setCarry({ kind: 'move', id })
    setFreeRot(f.rotation)
    setGhost({ x: f.x, y: f.y, rotation: f.rotation, wall_id: f.wall_id })
    setMode('place_fixture')
  }, [setMode])

  const cancel = useCallback(() => {
    setCarry(null)
    setGhost(null)
    if (mode === 'place_fixture') setMode('select')
  }, [mode, setMode])

  /** R while carrying: turn the free-floating item 90°. */
  const rotateCarry = useCallback(() => {
    setFreeRot(r => (r + 90) % 360)
  }, [])

  function snapAt(wp: Pt, free: boolean): FixtureSnap | null {
    if (!carried) return null
    // Doors / windows (P5) always sit in a wall — Shift doesn't free them.
    if (carried.category === 'opening') return snapOpening(wp, carried.width, walls, centroid(walls), SNAP_REACH)
    let s = snapFixture(wp, carried.width, carried.depth, free ? [] : walls, centroid(walls), SNAP_REACH, freeRot)
    // Moving along the same wall keeps its distance off the wall (a sink pulled forward stays forward).
    if (carry?.kind === 'move' && s.wall_id) {
      const cur = fixtures.find(f => f.id === carry.id)
      const ref = cur && cur.wall_id === s.wall_id ? fixtureWallRef(cur, walls, centroid(walls)) : null
      if (ref && Math.abs(ref.off) > 0.5) {
        const { n } = fixtureAxes(s.rotation)
        s = { ...s, x: s.x + n.x * ref.off, y: s.y + n.y * ref.off }
      }
    }
    // Appliances don't overlap cabinets: dropped over one it belongs to (oven over its
    // housing, rangehood under its wall unit) it links; anywhere else it slides to the
    // nearest free gap on the wall. Sinks / taps / cooktops sit on cabinets as before.
    const mount = carry?.kind === 'place' ? carry.item.mount : fixtures.find(f => f.id === (carry as { id: string }).id)?.mount
    if (!s.wall_id || !clearOf || sitsOnCabinets({ mount, category: carried.category })) return s
    if (linkAt?.({ ...s, width: carried.width, depth: carried.depth, mount: mount ?? 'floor', category: carried.category })) return s
    return clearOf(s, { id: carry?.kind === 'move' ? carry.id : undefined, width: carried.width, depth: carried.depth, height: carried.height, z: carriedZ })
  }

  /** Returns true when the move was a fixture carry (caller stops there). */
  function handlePointerMove(wp: Pt, free: boolean): boolean {
    if (mode !== 'place_fixture' || !carry) return false
    setGhost(snapAt(wp, free))
    return true
  }

  async function handlePointerUp(wp: Pt, free: boolean, cursorZ?: number): Promise<boolean> {
    if (mode !== 'place_fixture' || !carry) return false
    const s = snapAt(wp, free)
    if (!s) return true
    if (carry.kind === 'place') {
      const item = carry.item
      captureSnapshot()
      const row = {
        room_id: room.id, catalog_id: item.id, ...bodyFromCatalog(item),
        x: round1(s.x), y: round1(s.y), rotation: round3(s.rotation), wall_id: s.wall_id,
        z: benchZ(item, s) ?? defaultFixtureZ(item.mount, item.mount_height) - (item.mount === 'benchtop' ? Number(item.bench_drop) || 0 : 0),
        ...(s.depth != null ? { depth: s.depth } : {}),
        ...linkFields({ ...s, width: item.width, depth: s.depth ?? item.depth, mount: item.mount, category: item.category }),
      }
      const { data, error: e } = await supabase.from('room_fixtures').insert(row).select('*').single()
      if (e || !data) { setError(e?.message ?? 'Insert failed'); return true }
      const placed = data as RoomFixture
      setFixtures(prev => [...prev, placed])
      // One drop, then back to Select with it selected — like placing a cabinet.
      setCarry(null); setGhost(null); setMode('select')
      setSelected({ type: 'fixture', id: placed.id })
      onDropped?.(placed, cursorZ)
      return true
    }
    const id = carry.id
    setCarry(null); setGhost(null); setMode('select')
    const moved = fixtures.find(f => f.id === id)
    const z = moved ? benchZ(moved, s) : null
    const patch: Partial<RoomFixture> = {
      x: round1(s.x), y: round1(s.y), rotation: round3(s.rotation), wall_id: s.wall_id, ...(z != null ? { z } : {}),
      ...(s.depth != null ? { depth: s.depth } : {}),
      ...(moved ? linkFields({ ...s, width: moved.width, depth: s.depth ?? moved.depth, mount: moved.mount, category: moved.category }) : {}),
    }
    await update(id, patch)
    setSelected({ type: 'fixture', id })
    if (moved) onDropped?.({ ...moved, ...patch }, cursorZ)
    return true
  }

  // Benchtop-mount items sit on the top under their centre (less bench_drop for
  // sinks / drop-in cooktops). Null = not a benchtop item, or no benchtop there.
  function benchZ(f: Pick<RoomFixture, 'mount' | 'width' | 'depth' | 'bench_drop'>, s: FixtureSnap): number | null {
    if (f.mount !== 'benchtop' || !benchTopAt) return null
    const top = benchTopAt(fixtureCenter({ x: s.x, y: s.y, rotation: s.rotation, width: f.width, depth: f.depth }))
    if (top == null) return null
    return round1(top - (Number(f.bench_drop) || 0))
  }

  // Link to the cabinet under the dropped pose (P4) — or clear a stale link.
  // Moving / stretching it by hand takes it out of an open cell (z_ubo U4): it
  // stays where it's put, linked by position like any other fixture.
  function linkFields(f: FixtureFootprint & { mount: RoomFixture['mount']; category: RoomFixture['category'] }): Pick<RoomFixture, 'cabinet_id' | 'link_x' | 'link_z' | 'link_rot' | 'link_zone'> {
    const l = linkAt?.(f)
    return { ...(l ?? { cabinet_id: null, link_x: 0, link_z: 0, link_rot: 0 }), link_zone: null }
  }

  // ── Stretch (P7) — click a handle, the edge follows the cursor, click sets it ──

  /** `obstacles` = plan outlines the left / right edge stops at (stretchObstacles). */
  function startStretch(id: string, side: StretchSide, obstacles: Pt[][], step = 1) {
    const f = fixturesRef.current.find(x => x.id === id)
    if (!f) return
    captureSnapshot()   // one undo step for the whole stretch
    setStretch({ id, side, base: f, bounds: stretchBounds(f, walls, centroid(walls), obstacles), step })
  }

  /** Live: state only. Re-links as it goes so a linked item doesn't snap back to its old spot. */
  function stretchMove(cursor: { p?: Pt; z?: number }): boolean {
    if (!stretch) return false
    const p = stretchPatch(stretch.base, stretch.side, cursor, stretch.bounds, stretch.step)
    if (!p) return true
    // P11: a resizable model's cutout follows the stretch (from the size at the start).
    const cut = stretchedCutout(stretch.base, { ...stretch.base, ...p })
    const merged = { ...stretch.base, ...p, ...cut }
    const link = linkFields(merged)
    setFixtures(prev => prev.map(f => f.id === stretch.id ? { ...f, ...p, ...cut, ...link } : f))
    return true
  }

  async function commitStretch(): Promise<boolean> {
    if (!stretch) return false
    const s = stretch
    setStretch(null)
    const cur = fixturesRef.current.find(f => f.id === s.id)
    if (!cur) return true
    const keys = ['x', 'y', 'width', 'depth', 'height', 'z', 'cabinet_id', 'link_x', 'link_z', 'link_rot', 'link_zone',
      'cutout_w', 'cutout_d', 'cutout_off_x', 'cutout_off_y'] as const
    const patch: Record<string, unknown> = {}
    for (const k of keys) if (cur[k] !== s.base[k]) patch[k] = cur[k]
    if (!Object.keys(patch).length) return true
    const { error: e } = await supabase.from('room_fixtures')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', s.id)
    if (e) setError(e.message)
    return true
  }

  function cancelStretch() {
    if (!stretch) return
    const base = stretch.base
    setFixtures(prev => prev.map(f => f.id === base.id ? base : f))
    setStretch(null)
  }

  /** Stop following the cabinet (the fixture stays where it is). */
  async function unlink(id: string) {
    await update(id, { cabinet_id: null, link_x: 0, link_z: 0, link_rot: 0 })
  }

  async function update(id: string, patch: Partial<RoomFixture>) {
    // A pose change from the panel (centre / rotation fields) re-links to
    // whatever cabinet is now under it; callers that set the link pass it.
    if (('x' in patch || 'y' in patch || 'rotation' in patch) && !('cabinet_id' in patch)) {
      const f = fixturesRef.current.find(x => x.id === id)
      if (f) { const m = { ...f, ...patch }; patch = { ...patch, ...linkFields(m) } }
    }
    // P11: a resizable model's cutout follows a typed width / depth (unless the cutout itself is being set).
    if (('width' in patch || 'depth' in patch) && !Object.keys(patch).some(k => k.startsWith('cutout_'))) {
      const f = fixturesRef.current.find(x => x.id === id)
      if (f) patch = { ...patch, ...stretchedCutout(f, { ...f, ...patch }) }
    }
    captureSnapshot()
    setFixtures(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
    const { error: e } = await supabase.from('room_fixtures')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (e) setError(e.message)
  }

  /** Turn in place about the footprint centre (keeps the item where it is). */
  async function rotateBy(id: string, deg: number) {
    const f = fixturesRef.current.find(x => x.id === id)
    if (!f || f.category === 'opening') return   // openings stay square in their wall
    const c = fixtureCenter(f)
    const rotation = ((f.rotation + deg) % 360 + 360) % 360
    const bl = backLeftForCenter(c, rotation, f.width, f.depth)
    const pose = { x: round1(bl.x), y: round1(bl.y), rotation: round3(rotation) }
    await update(id, { ...pose, wall_id: null })
  }

  async function remove(id: string) {
    captureSnapshot()
    setFixtures(prev => prev.filter(f => f.id !== id))
    if (selected?.type === 'fixture' && selected.id === id) setSelected(null)
    const { error: e } = await supabase.from('room_fixtures').delete().eq('id', id)
    if (e) setError(e.message)
  }

  return {
    menuOpen, setMenuOpen,
    carry, ghost, carried, carriedZ, freeRot, error,
    arm, startMove, cancel, rotateCarry,
    handlePointerMove, handlePointerUp,
    update, rotateBy, remove, unlink,
    stretch, startStretch, stretchMove, commitStretch, cancelStretch,
  }
}

function round1(v: number) { return Math.round(v * 10) / 10 }
function round3(v: number) { return Math.round(v * 1000) / 1000 }
