'use client'

// Splashbacks in the room 3D view (z_splashback S2): the elevation outline
// (x along the wall as seen, y up) extruded off the wall face by its thickness,
// openings cut through. World: X = plan x, Y = up, Z = plan y (as Room3DScene).

import { useEffect, useMemo } from 'react'
import { Edges } from '@react-three/drei'
import { DoubleSide, ExtrudeGeometry, Matrix4, Path, Shape } from 'three'
import type { SplashbackInstance, Wall } from '@/src/lib/types'
import type { Pt } from '@/src/lib/geometry'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { outlinePoints } from '@/src/lib/benchtopGeometry'
import { openingHoles, sbBounds, sbFrame, sbOpenings, type SbRect } from '@/src/lib/splashbackGeometry'
import type { RoomFixture } from '@/src/lib/types'
import type { SbInfo } from './useSplashbacks'
import { alphaMat } from '@/src/components/three/PartViewer'

export interface Sb3DProps {
  splashbacks: SplashbackInstance[]
  infoFor: (sb: SplashbackInstance) => SbInfo
  fixtures: RoomFixture[]
  selectedId: string | null
  onSelect: (id: string) => void
}

const KIND_3D: Record<string, string> = {
  stone: '#e7e5e4', glass: '#bae6fd', mirror: '#e2e8f0', tile: '#fef3c7', acrylic: '#fbcfe8', board: '#f5f5f4', timber: '#d6a35c',
}

function SplashbackMesh({ sb, wall, rc, info, holes, selected, onSelect, layers }: {
  sb: SplashbackInstance; wall: Wall; rc: Pt; info: SbInfo; holes: SbRect[]
  selected: boolean; onSelect?: () => void; layers: LayerView
}) {
  // Holes are rebuilt each render — key the geometry on their values, not identity.
  const holesKey = JSON.stringify(holes)
  const { geo, matrix } = useMemo(() => {
    const pts = outlinePoints(sb.segments)
    const shape = new Shape(pts.map(p => ({ x: p.x, y: p.y }) as never))
    for (const h of holes) {
      const path = new Path()
      path.moveTo(h.x0, h.z0); path.lineTo(h.x0, h.z1); path.lineTo(h.x1, h.z1); path.lineTo(h.x1, h.z0); path.closePath()
      shape.holes.push(path)
    }
    const g = new ExtrudeGeometry(shape, { depth: info.thick, bevelEnabled: false })
    const f = sbFrame(wall, sb.wall_side, rc)
    const off = Number(sb.offset_mm) || 0
    const m = new Matrix4().makeBasis(
      { x: f.d.x, y: 0, z: f.d.y } as never, { x: 0, y: 1, z: 0 } as never, { x: f.n.x, y: 0, z: f.n.y } as never,
    ).setPosition(f.o.x + f.n.x * off, 0, f.o.y + f.n.y * off)
    return { geo: g, matrix: m }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- holes tracked by holesKey
  }, [sb.segments, sb.wall_side, sb.offset_mm, wall, rc, info.thick, holesKey])
  useEffect(() => () => geo.dispose(), [geo])

  const glassy = info.kind === 'glass' || info.kind === 'mirror'
  const col = selected ? '#f59e0b' : layers.color('splashbacks', KIND_3D[info.kind] ?? '#e7e5e4')
  const alpha = Math.min(layers.alpha('splashbacks'), glassy ? 0.55 : 1)
  return (
    <mesh geometry={geo} matrixAutoUpdate={false} matrix={matrix}
      onClick={onSelect ? e => { e.stopPropagation(); onSelect() } : undefined}>
      <meshStandardMaterial color={col} roughness={glassy ? 0.1 : 0.5} metalness={info.kind === 'mirror' ? 0.6 : 0} side={DoubleSide} {...alphaMat(alpha)} />
      <Edges threshold={20} color={selected ? '#f59e0b' : '#64748b'} transparent opacity={alpha} />
    </mesh>
  )
}

export default function Splashbacks3D({ sb, walls, rc, layers, hiddenWallIds, pick }: {
  sb: Sb3DProps; walls: Wall[]; rc: Pt; layers: LayerView; hiddenWallIds: Set<string>; pick: boolean
}) {
  if (!layers.show('splashbacks')) return null
  return (
    <>
      {sb.splashbacks.map(s => {
        const wall = walls.find(w => w.id === s.wall_id)
        const b = sbBounds(s.segments)
        if (!wall || !b || hiddenWallIds.has(wall.id)) return null
        const holes = openingHoles(b, sbOpenings(sb.fixtures, wall, s.wall_side, rc), Number(s.opening_reveal_mm) || 0)
        return (
          <SplashbackMesh key={s.id} sb={s} wall={wall} rc={rc} info={sb.infoFor(s)} holes={holes}
            selected={sb.selectedId === s.id} onSelect={pick ? () => sb.onSelect(s.id) : undefined} layers={layers} />
        )
      })}
    </>
  )
}
