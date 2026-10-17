'use client'
// 3D pull-out bin (z_bin_cabinet B5). Cabinet-space mm; render it inside the
// drawer's moving group. The carrier + bins slide out with the front; the frame
// + runners stay on the gables (the fixed group cancels the parent's travel).
//
// Geometry: binShape() — the port of build_bin.py, sized from the bin pick.
// A bin product with its own model (hardware_slides.model_url) renders that
// instead, FITTED to the bin envelope from its bounding box (any units / size);
// the parametric bin stands in while it loads.
import { Suspense, useMemo } from 'react'
import { FixedInDrawer } from './FixedInDrawer'
import * as THREE from 'three'
import type { ResolvedDrawerStack } from '@/src/lib/resolver/types'
import { binShape, type BinPart, type BinPartKind } from '@/src/lib/binGeometry'
import { ModelSource } from './ModelAsset'
import { PartAlpha } from './PartViewer'

// build_bin.py MATS
const LOOK: Record<BinPartKind, { color: string; metalness: number; roughness: number }> = {
  frame:   { color: '#bec0c4', metalness: 0.8, roughness: 0.35 },
  runner:  { color: '#a0a2a6', metalness: 0.9, roughness: 0.3 },
  carrier: { color: '#46484c', metalness: 0,   roughness: 0.6 },
  bin:     { color: '#5a5c60', metalness: 0,   roughness: 0.6 },
  rim:     { color: '#5a5c60', metalness: 0,   roughness: 0.6 },
  lid:     { color: '#cdcfd2', metalness: 0,   roughness: 0.6 },
}

// Tapered bin body: 8 corners, flat-shaded.
function frustumGeometry(p: Extract<BinPart, { shape: 'frustum' }>): THREE.BufferGeometry {
  const c = (y: number, [w, d]: [number, number]) => [
    [p.cx - w / 2, y, p.cz - d / 2], [p.cx + w / 2, y, p.cz - d / 2],
    [p.cx + w / 2, y, p.cz + d / 2], [p.cx - w / 2, y, p.cz + d / 2],
  ]
  const [b0, b1, b2, b3] = c(p.y0, p.bottom), [t0, t1, t2, t3] = c(p.y1, p.top)
  const quads = [[b0, b3, b2, b1], [t0, t1, t2, t3], [b0, b1, t1, t0], [b1, b2, t2, t1], [b2, b3, t3, t2], [b3, b0, t0, t3]]
  const pos: number[] = []
  for (const [a, b, cc, d] of quads) pos.push(...a, ...b, ...cc, ...a, ...cc, ...d)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

function PartMesh({ p, opacity }: { p: BinPart; opacity: number }) {
  const look = LOOK[p.kind]
  const geo = useMemo(() => (p.shape === 'frustum' ? frustumGeometry(p) : null), [p])
  const mat = <meshStandardMaterial {...look} side={THREE.DoubleSide} transparent={opacity < 1} opacity={opacity} />
  if (p.shape === 'frustum') return <mesh geometry={geo!}>{mat}</mesh>
  return (
    <mesh position={[p.x + p.w / 2, p.y + p.h / 2, p.z + p.d / 2]}>
      <boxGeometry args={[p.w, p.h, p.d]} />{mat}
    </mesh>
  )
}


function ParametricBin({ stack, opacity }: { stack: ResolvedDrawerStack; opacity: number }) {
  const parts = useMemo(() => binShape(stack), [stack])
  return (
    <group>
      <FixedInDrawer>{parts.filter(p => !p.moving).map((p, i) => <PartMesh key={`f${i}`} p={p} opacity={opacity} />)}</FixedInDrawer>
      {parts.filter(p => p.moving).map((p, i) => <PartMesh key={`m${i}`} p={p} opacity={opacity} />)}
    </group>
  )
}

type Envelope = { x: number; y: number; z: number; w: number; h: number; d: number }

function Fitted({ obj, env, nudge }: { obj: THREE.Object3D; env: Envelope; nudge: [number, number, number] }) {
  const fit = useMemo(() => {
    const bb = new THREE.Box3().setFromObject(obj)
    const size = bb.getSize(new THREE.Vector3())
    if (!(size.x > 0 && size.y > 0 && size.z > 0)) return null
    return { min: bb.min.clone(), scale: [env.w / size.x, env.h / size.y, env.d / size.z] as [number, number, number] }
  }, [obj, env.w, env.h, env.d])
  if (!fit) return null
  return (
    <group position={[env.x + nudge[0], env.y + nudge[1], env.z + nudge[2]]} scale={fit.scale}>
      <group position={[-fit.min.x, -fit.min.y, -fit.min.z]}>
        <primitive object={obj} />
      </group>
    </group>
  )
}

export default function Bin3D({ stack, opacity = 1 }: { stack: ResolvedDrawerStack; opacity?: number }) {
  const rail = stack.slides[0]
  const parametric = <ParametricBin stack={stack} opacity={opacity} />
  if (!rail?.model_url || !rail.model_format) return parametric
  const env: Envelope = { x: stack.box_X, y: stack.box_Y, z: stack.box_Z, w: stack.box_width, h: stack.box_height, d: stack.box_depth }
  return (
    <PartAlpha a={opacity}>
      <Suspense fallback={parametric}>
        <ModelSource url={rail.model_url} format={rail.model_format} look={{ color: LOOK.frame.color }}>
          {obj => <Fitted obj={obj} env={env} nudge={[rail.model_anchor_x, rail.model_anchor_y, rail.model_anchor_z]} />}
        </ModelSource>
      </Suspense>
    </PartAlpha>
  )
}
