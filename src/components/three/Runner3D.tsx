'use client'
// Parametric drawer runner (z_runner_models): runnerShape() — the port of
// build_runner.py — at the rail's own length × height. Cabinet-space mm; render
// it inside the drawer's moving group: the drawer side slides out, the cabinet
// member stays on the gable.
import { useMemo } from 'react'
import type { ResolvedDrawerSlide } from '@/src/lib/resolver/types'
import { runnerShape, type RunnerPartKind } from '@/src/lib/runnerGeometry'
import { FixedInDrawer } from './FixedInDrawer'

// build_runner.py MATS
const LOOK: Record<RunnerPartKind, { color: string; metalness: number; roughness: number }> = {
  side:    { color: '#e8e9eb', metalness: 0.3, roughness: 0.45 },
  runner:  { color: '#a0a2a6', metalness: 0.9, roughness: 0.3 },
  bracket: { color: '#46484c', metalness: 0,   roughness: 0.6 },
}

export default function Runner3D({ rail, opacity = 1 }: { rail: ResolvedDrawerSlide; opacity?: number }) {
  const parts = useMemo(() => runnerShape(rail), [rail])
  const mesh = (p: (typeof parts)[number], key: string) => (
    <mesh key={key} position={[p.x + p.w / 2, p.y + p.h / 2, p.z + p.d / 2]}>
      <boxGeometry args={[p.w, p.h, p.d]} />
      <meshStandardMaterial {...LOOK[p.kind]} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  )
  return (
    <group>
      <FixedInDrawer>{parts.filter(p => !p.moving).map((p, i) => mesh(p, `f${i}`))}</FixedInDrawer>
      {parts.filter(p => p.moving).map((p, i) => mesh(p, `m${i}`))}
    </group>
  )
}
