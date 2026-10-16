'use client'
// 3D pull-out bin (z_bin_cabinet B5). Cabinet-space mm; render it inside the
// drawer's moving group so it slides out with the front.
//
// With a model on the bin product (hardware_slides.model_url) the model is
// FITTED to the bin envelope — its bounding box stretched to the clear width ×
// bin height × nominal depth at the bin's floor-back-left corner — so a model
// in metres or mm, at any module size, lines up with the drilling. Without one
// (or while it loads) the generic shape from binShape() stands in.
import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import type { ResolvedDrawerStack } from '@/src/lib/resolver/types'
import { binShape } from '@/src/lib/binGeometry'
import { ModelSource } from './ModelAsset'
import { PartAlpha } from './PartViewer'

const METAL = '#9ca3af'
const BIN   = '#3f4651'

function GenericBin({ stack, opacity }: { stack: ResolvedDrawerStack; opacity: number }) {
  return (
    <group>
      {binShape(stack).map((b, i) => (
        <mesh key={i} position={[b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial
            color={b.kind === 'bin' ? BIN : METAL}
            metalness={b.kind === 'bin' ? 0.05 : 0.6}
            roughness={b.kind === 'bin' ? 0.8 : 0.4}
            transparent={opacity < 1} opacity={opacity}
          />
        </mesh>
      ))}
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
  const generic = <GenericBin stack={stack} opacity={opacity} />
  if (!rail?.model_url || !rail.model_format) return generic
  const env: Envelope = { x: stack.box_X, y: stack.box_Y, z: stack.box_Z, w: stack.box_width, h: stack.box_height, d: stack.box_depth }
  return (
    <PartAlpha a={opacity}>
      <Suspense fallback={generic}>
        <ModelSource url={rail.model_url} format={rail.model_format} look={{ color: METAL }}>
          {obj => <Fitted obj={obj} env={env} nudge={[rail.model_anchor_x, rail.model_anchor_y, rail.model_anchor_z]} />}
        </ModelSource>
      </Suspense>
    </PartAlpha>
  )
}
