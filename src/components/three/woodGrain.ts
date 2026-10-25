// ── Generic wood grain (z_material_colours MC9) ───────────────────────────────
// Grained colours (materials.has_grain) render their two big faces with one
// shared greyscale grain tile, tinted by the face colour (three multiplies the
// material colour by the map). The tile is drawn procedurally on a canvas —
// no image asset, nothing to license — from sums of integer-frequency sines,
// so it repeats seamlessly. Mapped at true scale: one tile = GRAIN_TILE mm,
// grain running along the part's length (DY, the CV grain axis).

import * as THREE from 'three'
import { createContext } from 'react'

// Material ids that render with the generic grain. Provided by the scene that
// knows the material colours (CabinetScene); empty = no grain anywhere.
export const GrainContext = createContext<ReadonlySet<string>>(new Set())

// Real-world size of one tile: across the grain × along the grain (mm).
export const GRAIN_TILE = { across: 300, along: 1200 }

const PX_ACROSS = 256, PX_ALONG = 1024

let shared: THREE.CanvasTexture | null = null

// Grain lines run along the texture's v (vertical) axis.
function grainTexture(): THREE.CanvasTexture {
  if (shared) return shared
  const canvas = document.createElement('canvas')
  canvas.width = PX_ACROSS
  canvas.height = PX_ALONG
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(PX_ACROSS, PX_ALONG)
  const TAU = Math.PI * 2
  for (let y = 0; y < PX_ALONG; y++) {
    const t = y / PX_ALONG
    for (let x = 0; x < PX_ACROSS; x++) {
      const u = x / PX_ACROSS
      // Slow sideways wander of the lines along the board (periodic in u and t).
      const s = u
        + 0.018 * Math.sin(TAU * (2 * t + 0.3))
        + 0.008 * Math.sin(TAU * (5 * t + 1 * u + 0.7))
        + 0.004 * Math.sin(TAU * (11 * t + 2 * u))
      // Line structure: a few bands of figure + fine pores.
      const bands =
        0.50 * Math.sin(TAU * (7 * s + 0.1)) +
        0.30 * Math.sin(TAU * (19 * s + 0.6)) +
        0.20 * Math.sin(TAU * (43 * s + 0.2))
      const lines = Math.pow(0.5 + 0.5 * Math.sin(TAU * (61 * s)), 6)       // thin darker lines
      const pores = 0.5 + 0.5 * Math.sin(TAU * (157 * s + 3 * t))
      const streak = Math.sin(TAU * (3 * t + 4 * u))                         // along-grain tone drift
      const v = 0.90 + 0.035 * bands - 0.10 * lines - 0.02 * pores + 0.015 * streak
      const g = Math.round(255 * Math.min(1, Math.max(0.62, v)))
      const i = (y * PX_ACROSS + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  shared = new THREE.CanvasTexture(canvas)
  shared.wrapS = shared.wrapT = THREE.RepeatWrapping
  shared.colorSpace = THREE.SRGBColorSpace
  shared.anisotropy = 4
  return shared
}

type Ext = 'w' | 'h' | 'd'
// BoxGeometry face order +X −X +Y −Y +Z −Z: the box extent each face's normal
// runs along, and the extents its uv u / v run along (three's buildPlane).
const FACE_NORMAL: Ext[] = ['w', 'w', 'h', 'h', 'd', 'd']
const FACE_UV: [Ext, Ext][] = [['d', 'h'], ['d', 'h'], ['w', 'd'], ['w', 'd'], ['w', 'h'], ['w', 'h']]

// One face's grain map: scaled so a tile is GRAIN_TILE mm, turned 90° when the
// grain runs along the face's u. null when the grain isn't in this face's plane.
function faceMap(size: Record<Ext, number>, uExt: Ext, vExt: Ext, grainExt: Ext): THREE.Texture | null {
  if (grainExt !== uExt && grainExt !== vExt) return null
  const tex = grainTexture().clone()
  tex.center.set(0.5, 0.5)
  if (grainExt === vExt) {
    tex.repeat.set(size[uExt] / GRAIN_TILE.across, size[vExt] / GRAIN_TILE.along)
  } else {
    // setUvTransform at 90°: texture u = repeat.x · face v, texture v (the
    // grain) = repeat.y · face u.
    tex.rotation = Math.PI / 2
    tex.repeat.set(size[vExt] / GRAIN_TILE.across, size[uExt] / GRAIN_TILE.along)
  }
  tex.needsUpdate = true
  return tex
}

// Grain maps per box face (the two big faces only — the ones whose normal is
// the thickness axis). grainExt / thickExt: which box extent holds DY / DZ.
export function boxGrainMaps(w: number, h: number, d: number, grainExt: Ext, thickExt: Ext): (THREE.Texture | null)[] {
  const size = { w, h, d }
  return FACE_NORMAL.map((n, i) => n === thickExt ? faceMap(size, FACE_UV[i][0], FACE_UV[i][1], grainExt) : null)
}

// Single-material panels (CSG-cut): one map laid out for the big faces.
export function singleGrainMap(w: number, h: number, d: number, grainExt: Ext, thickExt: Ext): THREE.Texture | null {
  const i = FACE_NORMAL.indexOf(thickExt)
  return faceMap({ w, h, d }, FACE_UV[i][0], FACE_UV[i][1], grainExt)
}
