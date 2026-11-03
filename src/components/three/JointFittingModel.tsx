'use client'

// ── JointFittingModel ─────────────────────────────────────────────────────────
// A joint's bought-in fitting (JointTypeOp.fitting, z_joints C4) at one set —
// the middle hole of the set, as seamDrillOps tags it. Model axes (cabinet mm
// after the row's model_scale): origin = middle pocket centre on the face,
// +Y out of the face, −X towards the seam edge (the screw runs that way).
// No model / loading / failed → the built-in Lamello Cabineo 12 stand-in at
// its catalogue size, 33.8 × 16.5 × 10.8 (Lincoln Sentry 7102676): 10 body in
// the 3 × Ø15 pocket, 0.8 collar on the surface, Ø5 screw 12 into the other panel.

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
  const housing = useMemo(() => lobes(-0.1, 10), [])
  const collar  = useMemo(() => lobes(0.75, 0.8), [])
  return (
    <group>
      {/* Shapes lie in X/Z: turn the extrude axis (+Z) to −Y (into the panel). */}
      <mesh geometry={housing} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={colour} />
      </mesh>
      <mesh geometry={collar} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.8, 0]}>
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

// Shelf support stand-in: Furnware SSW plastic support, metal pin (Mark,
// 2026-11-03; furnwaregroup.com.au SSW line drawing). Model axes as above with
// the pin's toward = up, so here +X = up, +Y = out of the face, origin = hole
// centre on the face. Ø5 pin 8 into the panel; body 10.5 wide x 8.5 out, its
// top 4 above the hole centre (the shelf sits there); thin back flange; a
// curved gusset under the body down to ~9 below the hole centre.
function SupportStandIn({ colour }: { colour: string }) {
  const body = useMemo(() => {
    // Side profile in (up, out) = shape (x, y); extruded across the 10.5 width.
    const sh = new THREE.Shape()
    sh.moveTo(4, 0.9)
    sh.lineTo(4, 8.5)
    sh.lineTo(-3, 8.5)
    sh.quadraticCurveTo(-3.5, 3.5, -9, 3)
    sh.lineTo(-9, 0.9)
    sh.closePath()
    const g = new THREE.ExtrudeGeometry(sh, { depth: 10.5, bevelEnabled: false, curveSegments: 8 })
    g.translate(0, 0, -5.25)
    return g
  }, [])
  return (
    <group>
      <mesh geometry={body}><meshStandardMaterial color={colour} /></mesh>
      {/* Back flange against the panel face. */}
      <mesh position={[-2.3, 0.45, 0]}>
        <boxGeometry args={[13.4, 0.9, 10.5]} />
        <meshStandardMaterial color={colour} />
      </mesh>
      {/* Pin: Ø5, 8 into the hole. */}
      <mesh position={[0, -4, 0]}>
        <cylinderGeometry args={[2.5, 2.5, 8, 16]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  )
}

export default function JointFittingModel({ drill }: { drill: DrillOpPos }) {
  const f = drill.fitting
  const q = useMemo(() => basis(drill.axis, f?.toward ?? 'x-'), [drill.axis, f?.toward])
  if (!f) return null
  const fb = f.kind === 'pin'
    ? <SupportStandIn colour={f.item.colour ?? '#f2f2f2'} />
    : <StandIn colour={f.item.colour ?? '#3a3a3a'} />
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
