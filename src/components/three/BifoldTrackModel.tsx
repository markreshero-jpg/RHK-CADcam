'use client'

// ── BifoldTrackModel ──────────────────────────────────────────────────────────
// Finista BF-05 track (z_bifold_slide): no maker model exists, so it's the
// BIFOLD_TRACK_PROFILE end shape (from the LS photo) extruded gable to gable —
// the track is cut to each cabinet's inside width. Powdercoated white (LS 7104967).

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { trackProfile, type BifoldTrack } from '@/src/lib/resolver/resolveBifold'

const WHITE = '#f2f2ee'

export default function BifoldTrackModel({ t, wire }: { t: BifoldTrack; wire?: boolean }) {
  const geo = useMemo(() => {
    // Shape in (cabinet z, cabinet y); extruded along its own +Z, which the
    // -90° Y turn below sends to cabinet -X — so it starts at the right end.
    const pts = trackProfile(t)
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p.z, p.y)))
    return new THREE.ExtrudeGeometry(shape, { depth: t.dx, bevelEnabled: false })
  }, [t])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo} position={[t.x + t.dx, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <meshStandardMaterial color={WHITE} metalness={0.3} roughness={0.45} wireframe={wire} side={THREE.DoubleSide} />
    </mesh>
  )
}
