'use client'

// Preview scene for HandleModelEditor (z_handles H8a): a strip of door, the
// handle's drilled holes as red dots drawn over everything, and the model (or
// the plain stand-in bar when there's none). Handle space, shifted back by
// half the projection so the camera frames it.

import { useMemo } from 'react'
import { HandleModel, type HandleModelLook } from '@/src/components/three/HandleModel'
import { finishLook } from '@/src/lib/handleModelFit'

const DOOR_T = 18
const DOOR_H = 70

type Row = Record<string, unknown>
const num = (v: unknown, d = 0) => { const n = Number(v); return isFinite(n) ? n : d }

export default function HandlePreviewScene({ row, holes, projection, length, onNativeSize }: {
  row: Row
  holes: { x: number; y: number }[]
  projection: number
  length: number | null
  onNativeSize: (s: { x: number; y: number; z: number }) => void
}) {
  const h: HandleModelLook = {
    finish:       (row.finish as string | null) ?? null,
    model_url:    (row.model_url as string | null) ?? null,
    model_format: (row.model_format as string | null) ?? null,
    model_scale:  num(row.model_scale, 1) || 1,
    model_rot_x:  num(row.model_rot_x), model_rot_y: num(row.model_rot_y), model_rot_z: num(row.model_rot_z),
    model_off_x:  num(row.model_off_x), model_off_y: num(row.model_off_y), model_off_z: num(row.model_off_z),
  }
  const look = useMemo(() => finishLook(h.finish), [h.finish])
  const xs = holes.map(p => p.x)
  const span = Math.max(length ?? 0, Math.max(...xs) - Math.min(...xs) + 40, 120)
  const barLen = length ?? Math.max(Math.max(...xs) - Math.min(...xs) + 20, 30)

  const fallback = (
    <mesh position={[0, 0, projection / 2]}>
      <boxGeometry args={[barLen, 12, projection]} />
      <meshStandardMaterial color={look.color} metalness={look.metalness} roughness={look.roughness} transparent opacity={0.6} />
    </mesh>
  )

  return (
    <group position={[0, 0, -projection / 2]}>
      {/* Door strip, front face on Z = 0 */}
      <mesh position={[0, 0, -DOOR_T / 2]}>
        <boxGeometry args={[span + 60, DOOR_H, DOOR_T]} />
        <meshStandardMaterial color="#e7e5e4" roughness={0.8} />
      </mesh>

      {/* Drilled holes: always on top so they read through the model */}
      {holes.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, 0.5]} renderOrder={10}>
          <sphereGeometry args={[2.5, 16, 12]} />
          <meshBasicMaterial color="#ef4444" depthTest={false} transparent />
        </mesh>
      ))}

      <HandleModel h={h} fallback={fallback} onNativeSize={onNativeSize} />
    </group>
  )
}
