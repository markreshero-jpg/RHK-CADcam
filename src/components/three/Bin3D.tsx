'use client'
// 3D pull-out bin (z_bin_cabinet B5): the generic shape from binShape() —
// metal runners + tray, dark bins. Cabinet-space mm; render it inside the
// drawer's moving group so it slides out with the front.
import type { ResolvedDrawerStack } from '@/src/lib/resolver/types'
import { binShape } from '@/src/lib/binGeometry'

const METAL = '#9ca3af'
const BIN   = '#3f4651'

export default function Bin3D({ stack, opacity = 1 }: { stack: ResolvedDrawerStack; opacity?: number }) {
  const boxes = binShape(stack)
  return (
    <group>
      {boxes.map((b, i) => (
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
