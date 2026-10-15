'use client'

// ── HandleModel ───────────────────────────────────────────────────────────────
// Renders a bought handle's uploaded model (z_handles D16 / H8) in handle space:
// origin = hole midpoint on the door's front face, +X along the handle, +Y up,
// +Z out of the door. Fitting maths: src/lib/handleModelFit.ts.
// No model / loading / failed → `fallback` (the caller's plain bar or knob).

import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { ModelSource, type ModelFormat } from './ModelAsset'
import { ModelErrorBoundary } from './FixtureModel'
import { handleRotatedBounds, handleFitOffset, handleModelEuler, finishLook } from '@/src/lib/handleModelFit'

export interface HandleModelLook {
  finish:       string | null
  model_url:    string | null
  model_format: ModelFormat | string | null
  model_scale:  number
  model_rot_x:  number
  model_rot_y:  number
  model_rot_z:  number
  model_off_x:  number
  model_off_y:  number
  model_off_z:  number
}

export function isModelFormat(f: unknown): f is ModelFormat {
  return f === 'glb' || f === 'stl' || f === 'obj'
}

export function hasHandleModel(h: Pick<HandleModelLook, 'model_url' | 'model_format'> | null | undefined): boolean {
  return !!h?.model_url && isModelFormat(h.model_format)
}

function Fitted({ obj, h, onNativeSize }: {
  obj: THREE.Object3D
  h: HandleModelLook
  onNativeSize?: (size: { x: number; y: number; z: number }) => void
}) {
  const native = useMemo(
    () => handleRotatedBounds(obj, h.model_rot_x, h.model_rot_y, h.model_rot_z),
    [obj, h.model_rot_x, h.model_rot_y, h.model_rot_z],
  )
  useEffect(() => {
    if (!onNativeSize || native.isEmpty()) return
    const sz = native.getSize(new THREE.Vector3())
    onNativeSize({ x: sz.x, y: sz.y, z: sz.z })
  }, [native, onNativeSize])

  const e = handleModelEuler(h.model_rot_x, h.model_rot_y, h.model_rot_z)
  return (
    <group position={handleFitOffset(native, h)}>
      <group rotation={e} scale={h.model_scale || 1}>
        <primitive object={obj} />
      </group>
    </group>
  )
}

export function HandleModel({ h, fallback, onNativeSize }: {
  h: HandleModelLook
  fallback: React.ReactNode
  onNativeSize?: (size: { x: number; y: number; z: number }) => void
}) {
  const look = useMemo(() => finishLook(h.finish), [h.finish])
  if (!h.model_url || !isModelFormat(h.model_format)) return <>{fallback}</>
  return (
    <ModelErrorBoundary fallback={fallback} resetKey={h.model_url}>
      <Suspense fallback={fallback}>
        <ModelSource url={h.model_url} format={h.model_format} look={look}>
          {obj => <Fitted obj={obj} h={h} onNativeSize={onNativeSize} />}
        </ModelSource>
      </Suspense>
    </ModelErrorBoundary>
  )
}
