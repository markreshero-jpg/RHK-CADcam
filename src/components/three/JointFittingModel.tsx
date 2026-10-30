'use client'

// ── JointFittingModel ─────────────────────────────────────────────────────────
// A joint's bought-in fitting (JointTypeOp.fitting, z_joints C4) at one set —
// the middle hole of the set, as seamDrillOps tags it. Model axes (cabinet mm
// after the row's model_scale): origin = middle pocket centre on the face,
// +Y out of the face, −X towards the seam edge (the screw runs that way).
// No model / loading / failed → the built-in Lamello Cabineo 12 stand-in
// (housing filling the 3 × Ø15 pocket, collar on the surface, Ø5 screw 12
// into the other panel).

import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { ModelSource } from './ModelAsset'
import { ModelErrorBoundary } from './FixtureModel'
import { isModelFormat } from './HandleModel'
import type { DrillAxis, DrillOpPos } from '@/src/lib/jointDrilling'

const STEEL = '#b5b5b5'

const vec = (a: DrillAxis) => {
  const v = new THREE.Vector3()
  v[a[0] as 'x' | 'y' | 'z'] = a[1] === '+' ? 1 : -1
  return v
}

function basis(axis: DrillAxis, toward: DrillAxis): THREE.Quaternion {
  const yImg = vec(axis).negate()        // out of the face
  const xImg = vec(toward).negate()      // away from the seam edge
  const zImg = new THREE.Vector3().crossVectors(xImg, yImg)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xImg, yImg, zImg))
}

// Cabineo 12 pocket outline: 3 circles at −11.2 / 0 / 11.2 (edge at −14.8),
// grown by `grow`, cut square at the edge. Extruded along +Z, so the caller
// turns it to lie in the face plane.
function lobes(grow: number, depth: number): THREE.ExtrudeGeometry {
  const r = 7.5 + grow, cs = [-11.2, 0, 11.2], x0 = -14.8, x1 = 11.2 + r
  const top = (x: number) => Math.max(0, ...cs.map(c => r * r - (x - c) ** 2).filter(v => v >= 0).map(Math.sqrt))
  const n = 90
  const xs = Array.from({ length: n + 1 }, (_, i) => x0 + (x1 - x0) * i / n)
  const shape = new THREE.Shape()
  shape.moveTo(x0, -top(x0))
  for (const x of xs) shape.lineTo(x, top(x))
  for (const x of [...xs].reverse()) shape.lineTo(x, -top(x))
  shape.closePath()
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 })
}

function StandIn({ colour }: { colour: string }) {
  const housing = useMemo(() => lobes(-0.1, 10.8), [])
  const collar  = useMemo(() => lobes(1.5, 1), [])
  return (
    <group>
      {/* Shapes lie in X/Z: turn the extrude axis (+Z) to −Y (into the panel). */}
      <mesh geometry={housing} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={colour} />
      </mesh>
      <mesh geometry={collar} rotation={[Math.PI / 2, 0, 0]} position={[0, 1, 0]}>
        <meshStandardMaterial color={colour} />
      </mesh>
      {/* Screw: shank from inside the housing out through the edge, 12 into the other panel. */}
      <mesh position={[(3 + -26.8) / 2, -5, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[2.5, 2.5, 3 + 26.8, 16]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[4.5, -5, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[4.5, 4.5, 3, 20]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  )
}

export default function JointFittingModel({ drill }: { drill: DrillOpPos }) {
  const f = drill.fitting
  const q = useMemo(() => basis(drill.axis, f?.toward ?? 'x-'), [drill.axis, f?.toward])
  if (!f) return null
  const fb = <StandIn colour={f.item.colour ?? '#3a3a3a'} />
  const m = f.item.model
  return (
    <group position={[drill.x, drill.y, drill.z]} quaternion={q}>
      {m && isModelFormat(m.format) ? (
        <ModelErrorBoundary fallback={fb} resetKey={m.url}>
          <Suspense fallback={fb}>
            <group scale={m.scale || 1}>
              <ModelSource url={m.url} format={m.format} look={{ color: f.item.colour ?? '#3a3a3a' }}>
                {obj => <primitive object={obj} />}
              </ModelSource>
            </group>
          </Suspense>
        </ModelErrorBoundary>
      ) : fb}
    </group>
  )
}
