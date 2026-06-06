'use client'

// ── HingeModel ────────────────────────────────────────────────────────────────
// Renders ONE named mesh from a combined two-part hinge GLB (Section 13).
//
// The GLB contains exactly two meshes:
//   • HingePlate   — screws to the carcass; stays fixed (rendered in world space)
//   • HingeCupArm  — bores into the door; rendered inside the door's rotating
//                    group so it swings with the door automatically.
//
// Model convention (from the authored GLB / HingeSpec):
//   origin (0,0,0) = plate-face bore centre at the cabinet gable
//   +Y = hinge knuckle axis (vertical)   +Z = gable face → door   units = mm
//
// This component only renders the geometry at the model origin; the parent is
// responsible for positioning/orienting the bore-centre origin onto the door's
// hinge axis. Material is overridden to a metallic look (trimesh GLBs ship
// without PBR materials).

import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'

export type HingeMeshName = 'HingePlate' | 'HingeCupArm'

function HingeMeshInner({ url, mesh, color }: { url: string; mesh: HingeMeshName; color: string }) {
  const gltf = useGLTF(url)
  const obj = useMemo(() => {
    // Combined GLBs name their meshes (HingePlate / HingeCupArm); single-part
    // files (a plate-free hinge, or a standalone plate) have no such name — render
    // the whole scene in that case.
    const src = gltf.scene.getObjectByName(mesh) ?? gltf.scene
    const c = src.clone(true)
    const mat = new THREE.MeshStandardMaterial({
      color, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide,
    })
    c.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.material = mat })
    // Node transform is identity in the authored file; placement is the parent's
    // job, so neutralise any stray local transform on the cloned node.
    c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1)
    return c
  }, [gltf.scene, mesh, color])
  if (!obj) return null
  return <primitive object={obj} />
}

export function HingeModel({ url, mesh, color = '#aab1bd' }: {
  url: string; mesh: HingeMeshName; color?: string
}) {
  return (
    <Suspense fallback={null}>
      <HingeMeshInner url={url} mesh={mesh} color={color} />
    </Suspense>
  )
}

export function preloadHingeModel(url: string) {
  useGLTF.preload(url)
}
