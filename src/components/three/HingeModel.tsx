'use client'

// ── HingeModel ────────────────────────────────────────────────────────────────
// Renders ONE named mesh from a hinge GLB (Section 13).
//
// The hinge body GLB may contain up to three named meshes. The PLATE is kept as
// its own separate model; the hinge BODY splits at the knuckle so it folds when
// the door swings:
//   • HingeCupArm — DOOR side: cup + front arm up to the knuckle split. Rendered
//                   inside the door's rotating group, so it swings with the door.
//   • HingeArm    — GABLE side (optional): the back arm from the knuckle to the
//                   plate end. Rendered fixed at the gable, folding about its
//                   plate-end pivot at the knuckle split. Omit it for a one-piece
//                   hinge body (then the whole body just swings with the door).
//   • HingePlate  — the mounting plate. Usually supplied as a SEPARATE plate GLB
//                   (model_plate_url); the combined mesh is only a fallback.
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

export type HingeMeshName = 'HingePlate' | 'HingeCupArm' | 'HingeArm'

function HingeMeshInner({ url, mesh, color, requireName }: { url: string; mesh: HingeMeshName; color: string; requireName?: boolean }) {
  const gltf = useGLTF(url)
  const obj = useMemo(() => {
    // Named meshes (HingePlate / HingeCupArm / HingeArm) are picked by name;
    // single-part files (a plate-free hinge, or a standalone plate) have no such
    // name — render the whole scene in that case. For an OPTIONAL mesh (e.g. the
    // gable-side HingeArm that only exists on split bodies), requireName suppresses
    // the whole-scene fallback so an absent mesh renders nothing.
    const named = gltf.scene.getObjectByName(mesh)
    if (!named && requireName) return null
    const src = named ?? gltf.scene
    const c = src.clone(true)
    const mat = new THREE.MeshStandardMaterial({
      color, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide,
    })
    c.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.material = mat })
    // Node transform is identity in the authored file; placement is the parent's
    // job, so neutralise any stray local transform on the cloned node.
    c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1)
    return c
  }, [gltf.scene, mesh, color, requireName])
  if (!obj) return null
  return <primitive object={obj} />
}

export function HingeModel({ url, mesh, color = '#aab1bd', requireName }: {
  url: string; mesh: HingeMeshName; color?: string; requireName?: boolean
}) {
  return (
    <Suspense fallback={null}>
      <HingeMeshInner url={url} mesh={mesh} color={color} requireName={requireName} />
    </Suspense>
  )
}

export function preloadHingeModel(url: string) {
  useGLTF.preload(url)
}
