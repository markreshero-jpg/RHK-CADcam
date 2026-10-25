// ── Generic wood grain (z_material_colours MC9) ───────────────────────────────
// Grained colours (materials.has_grain) render their two big faces with one
// shared grain tile, tinted by the face colour (three multiplies the material
// colour by the map). Drawn to suit the line-drawing look of the 3D view: a
// white tile (= the exact face colour) with thin dark grey grain lines that
// wander gently, no tonal shading. Drawn on a canvas — no image asset — with a
// seeded random so it's the same every load, and wrapped in both directions
// so it tiles seamlessly. Mapped at true scale: one tile = GRAIN_TILE mm.

import * as THREE from 'three'
import { createContext } from 'react'
import type { PanelKind } from './PartViewer'

// Material ids that render with the generic grain. Provided by the scene that
// knows the material colours (CabinetScene); empty = no grain anywhere.
export const GrainContext = createContext<ReadonlySet<string>>(new Set())

// Real-world size of one tile: across the grain × along the grain (mm).
export const GRAIN_TILE = { across: 300, along: 1200 }

const PX_ACROSS = 512, PX_ALONG = 2048
const MM_PER_PX = GRAIN_TILE.across / PX_ACROSS

let shared: THREE.CanvasTexture | null = null

// Small seeded PRNG (mulberry32) so the pattern is identical on every load.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Grain lines run along the texture's v (vertical) axis.
function grainTexture(): THREE.CanvasTexture {
  if (shared) return shared
  const canvas = document.createElement('canvas')
  canvas.width = PX_ACROSS
  canvas.height = PX_ALONG
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PX_ACROSS, PX_ALONG)
  ctx.lineCap = 'round'

  const rand = rng(20261025)
  const TAU = Math.PI * 2
  // Lines roughly every 6–16 mm across the board, a few drawn as close pairs.
  let x = 0
  while (x < PX_ACROSS) {
    x += (6 + rand() * 10) / MM_PER_PX
    if (x >= PX_ACROSS) break
    const x0 = x
    // Wander: integer cycles per tile so each line meets itself top-to-bottom.
    const a1 = (0.6 + rand() * 1.6) / MM_PER_PX, f1 = 1 + Math.floor(rand() * 2), p1 = rand() * TAU
    const a2 = (0.2 + rand() * 0.6) / MM_PER_PX, f2 = 3 + Math.floor(rand() * 4), p2 = rand() * TAU
    const shade = Math.round(70 + rand() * 60)               // dark to mid grey
    const width = 0.9 + rand() * 0.9
    const pair = rand() < 0.3 ? (1.2 + rand() * 1.5) / MM_PER_PX : 0
    for (const off of pair ? [0, pair] : [0]) {
      ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.55 + rand() * 0.35})`
      ctx.lineWidth = off ? width * 0.7 : width
      // Draw at x and wrapped copies so lines crossing the tile edge tile cleanly.
      for (const wrap of [-PX_ACROSS, 0, PX_ACROSS]) {
        ctx.beginPath()
        for (let y = 0; y <= PX_ALONG; y += 8) {
          const t = y / PX_ALONG
          const px = x0 + off + wrap + a1 * Math.sin(TAU * f1 * t + p1) + a2 * Math.sin(TAU * f2 * t + p2)
          if (y === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y)
        }
        ctx.stroke()
      }
    }
  }

  shared = new THREE.CanvasTexture(canvas)
  shared.wrapS = shared.wrapT = THREE.RepeatWrapping
  shared.colorSpace = THREE.SRGBColorSpace
  shared.anisotropy = 8
  return shared
}

type Ext = 'w' | 'h' | 'd'

// Which box extent the grain runs along, and which is the thickness, for a
// rendered part. Upright panels (sides, doors, drawer fronts, backs, curved
// wrap panels, end panels / fillers) run the grain up the panel; kick boards
// run it along their length; horizontal parts (bottoms, tops, shelves) run it
// along their length, left to right (the box w = DY for horizontals).
export function grainExtents(kind: PanelKind, id: string): { grain: Ext; thick: Ext } {
  if (kind === 'side')       return { grain: 'h', thick: 'w' }
  if (kind === 'horizontal') return { grain: 'w', thick: 'h' }
  return { grain: id.startsWith('tk_') ? 'w' : 'h', thick: 'd' }
}

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
// the thickness axis).
export function boxGrainMaps(w: number, h: number, d: number, grainExt: Ext, thickExt: Ext): (THREE.Texture | null)[] {
  const size = { w, h, d }
  return FACE_NORMAL.map((n, i) => n === thickExt ? faceMap(size, FACE_UV[i][0], FACE_UV[i][1], grainExt) : null)
}

// Shaped (extruded) parts: ExtrudeGeometry's uvs are in mm (caps: the outline
// x/y; walls: along the outline × along the extrusion), so the tile just
// repeats once per GRAIN_TILE. Returns [caps map, walls map] — the slot that
// carries the part's faces gets the grain:
//   'up'     (curved wrap panels): walls = the faces, grain up the extrusion (v);
//   'across' (sharknose profiles): walls = the faces, grain along the profile (u);
//   other    (custom outlines): caps = the faces; grain up the outline (v),
//            or along it (u) for horizontals and kick boards.
export function shapedGrainMaps(extrude: 'up' | 'across' | undefined, kind: PanelKind, id: string): (THREE.Texture | null)[] {
  const tex = grainTexture().clone()
  const alongU = extrude === 'across' || (!extrude && (kind === 'horizontal' || id.startsWith('tk_')))
  if (alongU) tex.rotation = Math.PI / 2
  tex.repeat.set(1 / GRAIN_TILE.across, 1 / GRAIN_TILE.along)
  tex.needsUpdate = true
  return extrude ? [null, tex] : [tex, null]
}

// Single-material panels (CSG-cut): one map laid out for the big faces.
export function singleGrainMap(w: number, h: number, d: number, grainExt: Ext, thickExt: Ext): THREE.Texture | null {
  const i = FACE_NORMAL.indexOf(thickExt)
  return faceMap({ w, h, d }, FACE_UV[i][0], FACE_UV[i][1], grainExt)
}
