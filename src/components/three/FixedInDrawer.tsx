'use client'
// Holds its children still while the drawer group they sit in slides in Z —
// for hardware whose cabinet member stays on the gable (bin frames, runner
// cabinet members). The drawer group is the nearest ancestor tagged
// userData.drawerTravel (DrawerAssembly, inner-drawer AnimatedGroup).
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'

export function FixedInDrawer({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    let p = ref.current?.parent ?? null
    while (p && !p.userData.drawerTravel) p = p.parent
    if (ref.current) ref.current.position.z = p ? -p.position.z : 0
  })
  return <group ref={ref}>{children}</group>
}
