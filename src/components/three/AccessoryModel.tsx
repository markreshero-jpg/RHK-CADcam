'use client'

// ── AccessoryModel ────────────────────────────────────────────────────────────
// A hanging rail or rail support drawn from its library model (z_accessories
// S1), in cabinet coords (mm). Each model's origin is its fixing point — from
// the files' own notes:
//   • rail          — left end, profile centre; runs +X (stretched to the cut length)
//   • end support   — panel face on the rail centreline; cup opens +X
//   • pillars       — shelf underside at the pillar centre; end pillar's closed end −X
// Right-hand ends turn 180° about Y. No model / loading / failed → `fallback`
// (the plain block).

import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { ModelSource } from './ModelAsset'
import { ModelErrorBoundary } from './FixtureModel'
import { isModelFormat } from './HandleModel'
import type { ResolvedInternalPart } from '@/src/lib/resolver/types'

function Fit({ obj, scale, length }: { obj: THREE.Object3D; scale: number; length?: number }) {
  const sx = useMemo(() => {
    if (!length) return 1
    const b = new THREE.Box3().setFromObject(obj.clone())   // unparented: native size
    const lx = b.max.x - b.min.x
    return lx > 0 ? length / (lx * scale) : 1
  }, [obj, scale, length])
  return <group scale={[scale * sx, scale, scale]}><primitive object={obj} /></group>
}

/** Where the model's origin sits for this part, and whether it is turned. */
export function accessoryAnchor(p: ResolvedInternalPart): { pos: [number, number, number]; turn: boolean; length?: number } {
  const a = p.accessory
  const zc = p.Z + p.DX / 2
  if (p.part_type === 'accessory') return { pos: [p.X, p.Y + p.DZ / 2, zc], turn: false, length: p.DY }
  const right = a?.side === 'right'
  if (a?.role === 'end_support') return { pos: [right ? p.X + p.DY : p.X, p.Y + p.DZ / 2, zc], turn: right }
  return { pos: [p.X + p.DY / 2, p.Y + p.DZ, zc], turn: right }
}

export function hasAccessoryModel(p: ResolvedInternalPart): boolean {
  const m = p.accessory?.model
  return !!m?.url && isModelFormat(m.format)
}

export default function AccessoryModel({ part, color, fallback }: {
  part: ResolvedInternalPart
  color: string
  fallback: React.ReactNode
}) {
  const m = part.accessory?.model
  if (!m?.url || !isModelFormat(m.format)) return <>{fallback}</>
  const { pos, turn, length } = accessoryAnchor(part)
  return (
    <ModelErrorBoundary fallback={fallback} resetKey={m.url}>
      <Suspense fallback={fallback}>
        <group position={pos} rotation={[0, turn ? Math.PI : 0, 0]}>
          <ModelSource url={m.url} format={m.format} look={{ color }}>
            {obj => <Fit obj={obj} scale={m.scale || 1} length={length} />}
          </ModelSource>
        </group>
      </Suspense>
    </ModelErrorBoundary>
  )
}
