'use client'

// ── Fixture placement + editing (z_fixtures P2) ───────────────────────────────
// F6 opens the Fixtures sidebar section. Picking a catalogue item "carries" it:
// the ghost follows the cursor, backs onto the nearest wall face (Shift = free),
// R turns it 90° while free, click drops it. Move re-uses the same carry.
// Placed rows copy the catalogue item (jobs stay as-built).
//
// Same shape as useBenchtopInteraction: direct supabase calls, optimistic state,
// captureSnapshot before every change so Ctrl+Z covers fixtures.

import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { Room, Wall, FixtureCatalogItem, RoomFixture, FixtureBody } from '@/src/lib/types'
import { centroid, type Pt } from '@/src/lib/geometry'
import { snapFixture, defaultFixtureZ, fixtureCenter, backLeftForCenter, type FixtureSnap, type FixtureFootprint } from '@/src/lib/fixtureGeometry'
import type { FixtureLink } from '@/src/lib/fixtureLinks'
import type { Mode, Selected } from './canvasTypes'

/** How far (mm) from a wall face the cursor can be and still snap to it. */
const SNAP_REACH = 600

export type FixtureCarry =
  | { kind: 'place'; item: FixtureCatalogItem }
  | { kind: 'move'; id: string }

const BODY_KEYS: (keyof FixtureBody)[] = [
  'category', 'kind', 'name', 'width', 'depth', 'height', 'mount', 'colour',
  'model_url', 'model_format', 'model_scale', 'model_rot_x', 'model_rot_y',
  'model_off_x', 'model_off_y', 'model_off_z',
  'cutout_shape', 'cutout_w', 'cutout_d', 'cutout_radius', 'cutout_off_x', 'cutout_off_y', 'bench_drop',
]

export function bodyFromCatalog(item: FixtureCatalogItem): FixtureBody {
  const out = {} as Record<string, unknown>
  for (const k of BODY_KEYS) out[k] = item[k]
  return out as unknown as FixtureBody
}

export function useFixtureInteraction({
  room, walls, fixtures, setFixtures, mode, setMode, selected, setSelected, captureSnapshot, benchTopAt, linkAt,
}: {
  room:          Room
  walls:         Wall[]
  fixtures:      RoomFixture[]
  setFixtures:   React.Dispatch<React.SetStateAction<RoomFixture[]>>
  /** P3: top height of the benchtop under a plan point, or null when there's none. */
  benchTopAt?:   (p: Pt) => number | null
  /** P4: the cabinet link for a pose (the cabinet it's dropped over), or null. */
  linkAt?:       (f: FixtureFootprint & { mount: RoomFixture['mount'] }) => FixtureLink | null
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
  // Key handlers in CanvasClient bind with stale closures — read fixtures fresh.
  const fixturesRef = useRef(fixtures)
  fixturesRef.current = fixtures

  const carried: Pick<RoomFixture, 'category' | 'kind' | 'name' | 'width' | 'depth'> | null =
    carry?.kind === 'place' ? carry.item
    : carry?.kind === 'move' ? fixtures.find(f => f.id === carry.id) ?? null
    : null

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
    return snapFixture(wp, carried.width, carried.depth, free ? [] : walls, centroid(walls), SNAP_REACH, freeRot)
  }

  /** Returns true when the move was a fixture carry (caller stops there). */
  function handlePointerMove(wp: Pt, free: boolean): boolean {
    if (mode !== 'place_fixture' || !carry) return false
    setGhost(snapAt(wp, free))
    return true
  }

  async function handlePointerUp(wp: Pt, free: boolean): Promise<boolean> {
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
        ...linkFields({ ...s, width: item.width, depth: item.depth, mount: item.mount }),
      }
      const { data, error: e } = await supabase.from('room_fixtures').insert(row).select('*').single()
      if (e || !data) { setError(e?.message ?? 'Insert failed'); return true }
      const placed = data as RoomFixture
      setFixtures(prev => [...prev, placed])
      setSelected({ type: 'fixture', id: placed.id })
      // Stay armed so several of the same item can be dropped; Esc ends.
      return true
    }
    const id = carry.id
    setCarry(null); setGhost(null); setMode('select')
    const moved = fixtures.find(f => f.id === id)
    const z = moved ? benchZ(moved, s) : null
    await update(id, {
      x: round1(s.x), y: round1(s.y), rotation: round3(s.rotation), wall_id: s.wall_id, ...(z != null ? { z } : {}),
      ...(moved ? linkFields({ ...s, width: moved.width, depth: moved.depth, mount: moved.mount }) : {}),
    })
    setSelected({ type: 'fixture', id })
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
  function linkFields(f: FixtureFootprint & { mount: RoomFixture['mount'] }): Pick<RoomFixture, 'cabinet_id' | 'link_x' | 'link_z' | 'link_rot'> {
    const l = linkAt?.(f)
    return l ?? { cabinet_id: null, link_x: 0, link_z: 0, link_rot: 0 }
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
    captureSnapshot()
    setFixtures(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
    const { error: e } = await supabase.from('room_fixtures')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (e) setError(e.message)
  }

  /** Turn in place about the footprint centre (keeps the item where it is). */
  async function rotateBy(id: string, deg: number) {
    const f = fixturesRef.current.find(x => x.id === id)
    if (!f) return
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
    carry, ghost, carried, freeRot, error,
    arm, startMove, cancel, rotateCarry,
    handlePointerMove, handlePointerUp,
    update, rotateBy, remove, unlink,
  }
}

function round1(v: number) { return Math.round(v * 10) / 10 }
function round3(v: number) { return Math.round(v * 1000) / 1000 }
