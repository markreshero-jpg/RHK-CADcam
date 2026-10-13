'use client'
// 3D handle (z_handles H2): a simple D-bar (two posts + bar) or a knob, built
// from handleShape() so it matches the 2D views, plus its drilled through-holes.
// Cabinet-space mm; `offset` shifts it into a moving parent's local frame
// (swinging door / sliding drawer). Bar and holes are separate layer items.
import type { HandleShape } from '@/src/lib/handleGeometry'

const BAR_R  = 5
const POST_R = 4
const COLOR  = '#9ca3af'
const HOLE_COLOR = '#f97316'

export default function Handle3D({ s, offset = [0, 0, 0], opacity = 1, showBar = true, showHoles = true }: {
  s: HandleShape
  offset?: [number, number, number]
  opacity?: number
  showBar?: boolean
  showHoles?: boolean
}) {
  const [ox, oy, oz] = offset
  const mat = <meshStandardMaterial color={COLOR} metalness={0.7} roughness={0.35} transparent={opacity < 1} opacity={opacity} />
  const cx = s.cx + ox, cy = s.cy + oy, fz = s.frontZ + oz

  // Through-holes: a bore the full door thickness, poking 0.3mm out of both
  // faces so it reads from the back (drill side) and when the bar is hidden.
  const thick = s.frontZ - s.backZ
  const holes = showHoles && s.holes.map((p, i) => (
    <mesh key={`h${i}`} position={[p.x + ox, p.y + oy, s.backZ + oz + thick / 2]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[p.r, p.r, thick + 0.6, 16]} />
      <meshBasicMaterial color={HOLE_COLOR} />
    </mesh>
  ))

  if (!showBar) return <group>{holes}</group>

  if (s.kind === 'knob') {
    const r = s.w / 2
    return (
      <group>
        {holes}
        <mesh position={[cx, cy, fz + s.projection / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[POST_R, POST_R, s.projection, 12]} />{mat}
        </mesh>
        <mesh position={[cx, cy, fz + s.projection - 4]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[r, r, 8, 24]} />{mat}
        </mesh>
      </group>
    )
  }

  const horiz = s.w >= s.h
  const len = horiz ? s.w : s.h
  const barZ = fz + s.projection - BAR_R
  // Posts sit on the holes; a handle saved without holes gets posts near its ends.
  const inset = Math.max(len / 2 - 10, 0)
  const posts = s.holes.length ? s.holes
    : horiz ? [{ x: s.cx - inset, y: s.cy }, { x: s.cx + inset, y: s.cy }]
    : [{ x: s.cx, y: s.cy - inset }, { x: s.cx, y: s.cy + inset }]
  return (
    <group>
      {holes}
      {posts.map((p, i) => (
        <mesh key={i} position={[p.x + ox, p.y + oy, fz + (s.projection - BAR_R) / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[POST_R, POST_R, s.projection - BAR_R, 12]} />{mat}
        </mesh>
      ))}
      <mesh position={[cx, cy, barZ]} rotation={horiz ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
        <cylinderGeometry args={[BAR_R, BAR_R, len, 16]} />{mat}
      </mesh>
    </group>
  )
}
