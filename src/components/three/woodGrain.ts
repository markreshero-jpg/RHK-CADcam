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
import { GRAIN_TILE, grainLines } from '@/src/lib/grainLines'

// Material ids that render with the generic grain. Provided by the scene that
// knows the material colours (CabinetScene); empty = no grain anywhere.
export const GrainContext = createContext<ReadonlySet<string>>(new Set())
// The cabinet's fronts run their grain across (a horizontal grain match group,
// z_grain_match G3): face-zone parts turn their grain to the box width.
export const FrontGrainAcrossContext = createContext(false)

// The tile: white (= the exact face colour) with the shared grain lines
// (src/lib/grainLines.ts) drawn in thin dark grey. Grain runs along v.
const PX_PER_MM = 512 / GRAIN_TILE.across

let shared: THREE.CanvasTexture | null = null

function grainTexture(): THREE.CanvasTexture {
  if (shared) return shared
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(GRAIN_TILE.across * PX_PER_MM)
  canvas.height = Math.round(GRAIN_TILE.along * PX_PER_MM)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.lineCap = 'round'
  for (const l of grainLines()) {
    const g = Math.round(l.shade * 255)
    ctx.strokeStyle = `rgba(${g},${g},${g},${l.alpha})`
    ctx.lineWidth = l.width * PX_PER_MM
    for (const wrap of [-GRAIN_TILE.across, 0, GRAIN_TILE.across]) {
      ctx.beginPath()
      l.pts.forEach(([x, y], i) => {
        const px = (x + wrap) * PX_PER_MM, py = y * PX_PER_MM
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      })
      ctx.stroke()
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
