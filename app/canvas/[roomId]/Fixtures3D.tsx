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
              <FixtureModel f={{ ...f, colour }} />
            </PartAlpha>
            {f.id === selectedId && <FixtureOutline w={f.width} h={f.height} d={f.depth} color="#f59e0b" />}
          </group>
        )
      })}
    </>
  )
}
