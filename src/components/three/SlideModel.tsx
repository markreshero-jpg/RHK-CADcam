'use client'

// ── SlideModel ────────────────────────────────────────────────────────────────
// Renders an uploaded 3D model (GLB / STL / OBJ) as a drawer slide rail.
//
// Convention: model origin = front-top-outer corner of the runner.
//   +X = toward the drawer (away from gable)
//   +Y = up
//   +Z = into the cabinet (away from front)
//
// For the right rail we negate X so the same model can serve both sides.
//
// Suspense boundary lives INSIDE this component (not around the parent canvas)
// so a slow or broken model degrades to the metallic-box fallback, not a blank
// scene.

import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

export type SlideModelFormat = 'glb' | 'stl' | 'obj'

export interface SlideModelProps {
  url:              string
  format:           SlideModelFormat
  scale:            number
  anchor:           { x: number; y: number; z: number }
  position:         [number, number, number]
  sideOrientation:  'left' | 'right'
  color?:           string | null
  // Dimensions (mm) used by the metallic-box fallback when the model is
  // loading or fails to load. Pass the rail's (thickness, height, depth) so the
  // fallback matches the current procedural look.
  fallbackBox?:     { w: number; h: number; d: number }
}

interface LoaderProps {
  url:   string
  color: string
}

// ── Format-specific loader components ─────────────────────────────────────────
// Each one is its own component so React mounts/unmounts the right hook based
// on `format`. New formats: add a component + entry to LOADERS below.

// Force all meshes in a loaded object to render double-sided. Necessary because
// the right rail is rendered with a negative X scale, which inverts triangle
// winding — single-sided materials would render the right rail inside-out.
// Cheap for runner-sized meshes; safer than per-material patching.
function applyDoubleSide(obj: THREE.Object3D) {
  obj.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of mats) {
      if (mat) (mat as THREE.Material).side = THREE.DoubleSide
    }
  })
}

function GlbInner({ url }: LoaderProps) {
  const gltf = useGLTF(url)
  const cloned = useMemo(() => {
    const c = gltf.scene.clone(true)
    applyDoubleSide(c)
    return c
  }, [gltf.scene])
  return <primitive object={cloned} />
}

function StlInner({ url, color }: LoaderProps) {
  const geometry = useLoader(STLLoader, url)
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} side={THREE.DoubleSide} />
    </mesh>
  )
}

function ObjInner({ url, color }: LoaderProps) {
  const obj = useLoader(OBJLoader, url)
  const cloned = useMemo(() => {
    const g = obj.clone(true)
    g.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.material = new THREE.MeshStandardMaterial({
          color, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide,
        })
      }
    })
    return g
  }, [obj, color])
  return <primitive object={cloned} />
}

const LOADERS: Record<SlideModelFormat, React.ComponentType<LoaderProps>> = {
  glb: GlbInner,
  stl: StlInner,
  obj: ObjInner,
}

// ── Fallback box (matches the metallic-runner look used today) ────────────────
// Anchored to the same convention origin (front-top-outer), extending into
// +X / -Y / -Z so it occupies the rail volume regardless of mirroring.

function FallbackRunner({ w, h, d, color }: { w: number; h: number; d: number; color: string }) {
  return (
    <mesh position={[w / 2, -h / 2, -d / 2]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
    </mesh>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export function SlideModel({
  url, format, scale, anchor, position, sideOrientation, color, fallbackBox,
}: SlideModelProps) {
  const Loader = LOADERS[format]
  const safeColor = color || '#6b7280'
  const mirror = sideOrientation === 'right' ? -1 : 1
  const fb = fallbackBox ?? { w: 12, h: 30, d: 450 }

  return (
    <group position={position}>
      <group position={[anchor.x, anchor.y, anchor.z]} scale={scale}>
        <group scale={[mirror, 1, 1]}>
          <Suspense fallback={<FallbackRunner w={fb.w} h={fb.h} d={fb.d} color={safeColor} />}>
            <Loader url={url} color={safeColor} />
          </Suspense>
        </group>
      </group>
    </group>
  )
}

// Warm the GLB cache for a URL — call from resolver-complete code paths so
// cabinets with many drawers sharing the same slide fetch the model once.
export function preloadSlideModel(format: SlideModelFormat, url: string) {
  if (format === 'glb') useGLTF.preload(url)
}
