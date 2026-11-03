'use client'

// ── SliderProfileModel ────────────────────────────────────────────────────────
// Häfele Slider SC (z_slider_sc): one aluminium piece — a track or a door
// profile — as its end section extruded to its cut length. No maker model; the
// sections are off the AA01SLIDERSC brochure (sliderSC.ts). Cabinet coords.

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { SLIDER_COLOUR, type SliderPiece } from '@/src/lib/resolver/sliderSC'

export default function SliderProfileModel({ p, wire }: { p: SliderPiece; wire?: boolean }) {
  const geo = useMemo(() => {
    const flip = p.plane === 'xz' ? -1 : 1
    const shape = new THREE.Shape(p.pts.map(([a, b]) => new THREE.Vector2(a, flip * b)))
    return new THREE.ExtrudeGeometry(shape, { depth: p.length, bevelEnabled: false })
  }, [p])
  useEffect(() => () => geo.dispose(), [geo])
  // 'zy': shape in (z, y), extruded along its +Z; turning −90° about Y sends the
  //       shape's x to cabinet z and the extrusion to cabinet −X, so it starts at
  //       start + length and runs back to start.
  // 'xz': shape in (x, z), extruded along +Z; turning −90° about X sends the
  //       extrusion to cabinet +Y and the shape's y to cabinet −Z, so the shape
  //       is built with z negated.
  const pos: [number, number, number] = p.plane === 'zy' ? [p.start + p.length, 0, 0] : [0, p.start, 0]
  const rot: [number, number, number] = p.plane === 'zy' ? [0, -Math.PI / 2, 0] : [-Math.PI / 2, 0, 0]
  return (
    <mesh geometry={geo} position={pos} rotation={rot}>
      <meshStandardMaterial color={SLIDER_COLOUR[p.finish]} metalness={0.3} roughness={0.45} wireframe={wire} side={THREE.DoubleSide} />
    </mesh>
  )
}
