'use client'

// ── RailBlockModel ────────────────────────────────────────────────────────────
// Knock-in nylon blocks behind finger-pull rails (z_handles D20), drawn from
// the Furnware CCP model at each hole railBlockEnds gives (the same positions
// the CNC drills). Model (metres, Y up): origin = peg axis on the body's
// underside, peg down −Y, square end (screw into the rail) −X, 19 wide on Z.
// Placed so the peg runs into the panel along the hole axis and the square end
// faces the rail. Loading / failed → a white box the block's size.

import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { ModelSource } from './ModelAsset'
import { ModelErrorBoundary } from './FixtureModel'
import { RAIL_BLOCK_MODEL_URL, type RailBlockEnd } from '@/src/lib/resolver/railBlocks'

const WHITE = '#f2f2ee'

// Model axes → cabinet axes: −Y into the panel, −X towards the rail (+Z).
function basis(axis: RailBlockEnd['axis']): THREE.Quaternion {
  const into = axis === 'x-' ? -1 : 1
  const xImg = new THREE.Vector3(0, 0, -1)
  const yImg = new THREE.Vector3(-into, 0, 0)
  const zImg = new THREE.Vector3().crossVectors(xImg, yImg)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xImg, yImg, zImg))
}

function Fallback({ e }: { e: RailBlockEnd }) {
  // Body only: 20.4 deep (behind the rail) × 19 tall × 12 off the panel face.
  const into = e.axis === 'x-' ? -1 : 1
  return (
    <mesh position={[e.x - into * 6, e.y, e.z + 4.3]}>
      <boxGeometry args={[12, 19, 20.4]} />
      <meshStandardMaterial color={WHITE} />
    </mesh>
  )
}

export default function RailBlockModel({ end }: { end: RailBlockEnd }) {
  const q = useMemo(() => basis(end.axis), [end.axis])
  const fb = <Fallback e={end} />
  return (
    <ModelErrorBoundary fallback={fb} resetKey={RAIL_BLOCK_MODEL_URL}>
      <Suspense fallback={fb}>
        <group position={[end.x, end.y, end.z]} quaternion={q} scale={1000}>
          <ModelSource url={RAIL_BLOCK_MODEL_URL} format="glb" look={{ color: WHITE }}>
            {obj => <primitive object={obj} />}
          </ModelSource>
        </group>
      </Suspense>
    </ModelErrorBoundary>
  )
}
