'use client'

// ── BifoldTrackModel ──────────────────────────────────────────────────────────
// Finista BF-05 track (z_bifold_slide): no maker model exists, so it's drawn as
// an aluminium U-channel cut to the cabinet's inside width — the BIFOLD_TRACK
// profile from the BR0124CH sheet. Open toward the roller (down under the top /
// under the bottom, up on top of the bottom). Powdercoated white (LS 7104967).

import { BIFOLD_TRACK, type BifoldTrack } from '@/src/lib/resolver/resolveBifold'

const WHITE = '#f2f2ee'

export default function BifoldTrackModel({ t, wire }: { t: BifoldTrack; wire?: boolean }) {
  const w = BIFOLD_TRACK.wall
  const cx = t.x + t.dx / 2, cz = t.z + t.dz / 2
  // Web on the closed side, a flange down each long edge.
  const webY = t.open === 'down' ? t.y + t.dy - w / 2 : t.y + w / 2
  const boxes: [number, number, number, number, number, number][] = [
    [cx, webY, cz, t.dx, w, t.dz],
    [cx, t.y + t.dy / 2, t.z + w / 2, t.dx, t.dy, w],
    [cx, t.y + t.dy / 2, t.z + t.dz - w / 2, t.dx, t.dy, w],
  ]
  return (
    <group>
      {boxes.map(([x, y, z, dx, dy, dz], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[dx, dy, dz]} />
          <meshStandardMaterial color={WHITE} metalness={0.2} roughness={0.5} wireframe={wire} />
        </mesh>
      ))}
    </group>
  )
}
