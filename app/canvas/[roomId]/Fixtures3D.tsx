'use client'

// ── Fixtures in the room 3D (z_fixtures P2) ───────────────────────────────────
// Plan (x, y) → world (X, Z); underside z → world Y. The item frame (back-left
// origin, +X width, +Z front) turns by −rotation about Y (fixtureGeometry).
// Fixtures snapped to a wall hide with that wall, like cabinets.

import type { RoomFixture } from '@/src/lib/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { PartAlpha } from '@/src/components/three/PartViewer'
import { FixtureModel, FixtureOutline } from '@/src/components/three/FixtureModel'
import { fixtureLayer } from '@/src/lib/fixtureGeometry'

// Door / window (P5) with no model: a frame lining the hole, plus glass
// (window / sliding) or a closed leaf near the room face (door). Item frame:
// z = 0 outer face … depth = inside face.
function OpeningModel({ f, colour }: { f: RoomFixture; colour: string | null }) {
  const w = f.width, h = f.height, d = f.depth
  const fr = Math.min(50, w / 10, h / 10)
  const kind = (f.kind ?? '').toLowerCase()
  const frameCol = colour ?? '#e5e7eb'
  const box = (key: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, col: string, opacity = 1) => (
    <mesh key={key} position={[x, y, z]}>
      <boxGeometry args={[sx, sy, sz]} />
      <meshStandardMaterial color={col} roughness={0.6} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  )
  const isWindow = kind.includes('window'), isSliding = kind.includes('sliding'), isDoor = kind.includes('door') && !isSliding
  const head = [
    box('l', fr / 2, h / 2, d / 2, fr, h, d, frameCol),
    box('r', w - fr / 2, h / 2, d / 2, fr, h, d, frameCol),
    box('t', w / 2, h - fr / 2, d / 2, w, fr, d, frameCol),
  ]
  const sill = isWindow ? [box('b', w / 2, fr / 2, d / 2, w, fr, d, frameCol)] : []
  const glass = '#93c5fd'
  return <>
    {head}{sill}
    {isWindow && box('g', w / 2, h / 2, d / 2, w - 2 * fr, h - 2 * fr, 6, glass, 0.35)}
    {isSliding && <>
      {box('g1', w * 0.27, (h - fr) / 2, d / 2 - 15, w / 2, h - fr, 10, glass, 0.35)}
      {box('g2', w * 0.73, (h - fr) / 2, d / 2 + 15, w / 2, h - fr, 10, glass, 0.35)}
    </>}
    {isDoor && box('leaf', w / 2, (h - fr) / 2, Math.max(20, d - 25), w - 2 * fr, h - fr, 38, '#d6c7a8')}
  </>
}

export interface Fixtures3DProps {
  fixtures:   RoomFixture[]
  selectedId: string | null
  onSelect:   (id: string) => void
}

export default function Fixtures3D({ fixtures, selectedId, onSelect, layers, hiddenWallIds, pick }: Fixtures3DProps & {
  layers: LayerView
  hiddenWallIds: Set<string>
  /** false in F4 / measure: fixtures don't take clicks. */
  pick: boolean
}) {
  return (
    <>
      {fixtures.map(f => {
        const id = fixtureLayer(f.category)
        if (!layers.show(id)) return null
        if (f.wall_id && hiddenWallIds.has(f.wall_id)) return null
        const colour = layers.colorOf(id) ?? f.colour
        return (
          <group key={f.id}
            position={[f.x, f.z, f.y]}
            rotation={[0, -f.rotation * Math.PI / 180, 0]}
            onClick={pick ? e => { e.stopPropagation(); onSelect(f.id) } : undefined}
          >
            <PartAlpha a={layers.alpha(id)}>
              {f.category === 'opening' && !f.model_url
                ? <OpeningModel f={f} colour={layers.colorOf(id) ?? null} />
                : <FixtureModel f={{ ...f, colour }} />}
            </PartAlpha>
            {f.id === selectedId && <FixtureOutline w={f.width} h={f.height} d={f.depth} color="#f59e0b" />}
          </group>
        )
      })}
    </>
  )
}
