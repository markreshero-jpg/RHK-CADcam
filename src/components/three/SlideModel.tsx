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
// scene. Loading itself is shared with fixtures — see ModelAsset.tsx.

import { Suspense, useContext } from 'react'
import { PartAlphaContext, alphaMat } from './PartViewer'
import { ModelSource, preloadModel, type ModelFormat } from './ModelAsset'

export type SlideModelFormat = ModelFormat

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

// ── Fallback box (matches the metallic-runner look used today) ────────────────
// Anchored to the same convention origin (front-top-outer), extending into
// +X / -Y / -Z so it occupies the rail volume regardless of mirroring.

function FallbackRunner({ w, h, d, color }: { w: number; h: number; d: number; color: string }) {
  const alpha = useContext(PartAlphaContext)
  return (
    <mesh key={alpha < 1 ? 't' : 'o'} position={[w / 2, -h / 2, -d / 2]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} {...alphaMat(alpha)} />
    </mesh>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export function SlideModel({
  url, format, scale, anchor, position, sideOrientation, color, fallbackBox,
}: SlideModelProps) {
  const safeColor = color || '#6b7280'
  const mirror = sideOrientation === 'right' ? -1 : 1
  const fb = fallbackBox ?? { w: 12, h: 30, d: 450 }

  return (
    <group position={position}>
      <group position={[anchor.x, anchor.y, anchor.z]} scale={scale}>
        <group scale={[mirror, 1, 1]}>
          <Suspense fallback={<FallbackRunner w={fb.w} h={fb.h} d={fb.d} color={safeColor} />}>
            <ModelSource url={url} format={format} look={{ color: safeColor }}>
              {obj => <primitive object={obj} />}
            </ModelSource>
          </Suspense>
        </group>
      </group>
    </group>
  )
}

// Warm the GLB cache for a URL — call from resolver-complete code paths so
// cabinets with many drawers sharing the same slide fetch the model once.
export function preloadSlideModel(format: SlideModelFormat, url: string) {
  preloadModel(format, url)
}
