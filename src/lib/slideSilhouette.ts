'use client'

// ── Slide silhouette ──────────────────────────────────────────────────────────
// Projects an uploaded drawer-slide 3D model (GLB / STL / OBJ) onto a 2D
// orthographic plane so the modal's Top / Elevation / Side views can draw the
// rail's TRUE shape instead of its bounding box.
//
// The model placement convention here is IDENTICAL to the one SlideModel uses in
// the 3D view (src/components/three/SlideModel.tsx + Cabinet3DView), so the 2D
// silhouette lands exactly over the box it replaces:
//
//   model origin = front-top-outer corner of the runner
//     +X = toward the drawer (away from gable)   +Y = up   +Z = into cabinet
//
//   originX = side==='left' ? X : X + DZ   (outer face against the gable)
//   originY = Y + DY                        (top of the channel)
//   originZ = Z + DX                        (front of the rail)
//   right rail mirrors X (scale [-1,1,1])
//
//   cab = (originX + anchorX + scale*mirror*mx,
//          originY + anchorY + scale*my,
//          originZ + anchorZ + scale*mz)
//
// three's loaders are imported dynamically inside loadSlideTriangles so the
// canvas bundle stays light until a cabinet actually has a slide model to draw.

import { useEffect, useRef, useState } from 'react'

export type SlideModelFormat = 'glb' | 'stl' | 'obj'

// Minimal shape needed to place + project a rail. ResolvedDrawerSlide satisfies it.
export interface SlidePlacement {
  side:           'left' | 'right'
  X: number; Y: number; Z: number
  DX: number; DY: number; DZ: number
  model_scale:    number
  model_anchor_x: number
  model_anchor_y: number
  model_anchor_z: number
}

type P2 = { x: number; y: number }

// ── Geometry loading (cached by url, three imported on demand) ─────────────────

// Flat triangle soup in model-local space: [x0,y0,z0, x1,y1,z1, x2,y2,z2, …].
const triCache = new Map<string, Promise<Float32Array>>()

export function loadSlideTriangles(url: string, format: SlideModelFormat): Promise<Float32Array> {
  const key = `${format}:${url}`
  let p = triCache.get(key)
  if (!p) { p = doLoad(url, format); triCache.set(key, p) }
  return p
}

async function doLoad(url: string, format: SlideModelFormat): Promise<Float32Array> {
  const THREE = await import('three')

  let root: import('three').Object3D
  if (format === 'glb') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const gltf = await new GLTFLoader().loadAsync(url)
    root = gltf.scene
  } else if (format === 'stl') {
    const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
    const geo = await new STLLoader().loadAsync(url)
    root = new THREE.Mesh(geo)
  } else {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
    root = await new OBJLoader().loadAsync(url)
  }

  root.updateMatrixWorld(true)
  const out: number[] = []
  const v = new THREE.Vector3()
  root.traverse(o => {
    const mesh = o as import('three').Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const pos = mesh.geometry.attributes.position as import('three').BufferAttribute
    if (!pos) return
    const idx = mesh.geometry.index
    const m = mesh.matrixWorld
    const push = (i: number) => { v.fromBufferAttribute(pos, i).applyMatrix4(m); out.push(v.x, v.y, v.z) }
    if (idx) for (let i = 0; i < idx.count; i++) push(idx.getX(i))
    else     for (let i = 0; i < pos.count; i++) push(i)
  })
  return new Float32Array(out)
}

// ── React hook: load every distinct slide model used by a cabinet ──────────────

export interface SlideModelRef { model_url: string | null; model_format: SlideModelFormat | null }

// Returns a Map keyed by `${format}:${url}` → triangle soup. Entries appear as
// each model resolves; consumers fall back to the box while an entry is absent.
export function useSlideTriangles(slides: SlideModelRef[]): Map<string, Float32Array> {
  const [map, setMap] = useState<Map<string, Float32Array>>(() => new Map())

  // Stable signature of the distinct models requested, so the effect only re-runs
  // when the set of model URLs actually changes (not on every parent render).
  const refs = slides.filter(s => s.model_url && s.model_format) as Required<SlideModelRef>[]
  const sig = Array.from(new Set(refs.map(s => `${s.model_format}:${s.model_url}`))).sort().join('|')
  const sigRef = useRef('')

  useEffect(() => {
    sigRef.current = sig
    if (!sig) { setMap(new Map()); return }
    let cancelled = false
    const keys = sig.split('|')
    Promise.all(keys.map(async key => {
      const sep = key.indexOf(':')
      const format = key.slice(0, sep) as SlideModelFormat
      const url = key.slice(sep + 1)
      try { return [key, await loadSlideTriangles(url, format)] as const }
      catch (e) { console.error('slide model load failed', url, e); return null }
    })).then(entries => {
      if (cancelled) return
      const next = new Map<string, Float32Array>()
      for (const e of entries) if (e) next.set(e[0], e[1])
      setMap(next)
    })
    return () => { cancelled = true }
  }, [sig])

  return map
}

export function triKey(s: SlideModelRef): string | null {
  return s.model_url && s.model_format ? `${s.model_format}:${s.model_url}` : null
}

// ── Projection (pure) ──────────────────────────────────────────────────────────

function placement(s: SlidePlacement) {
  return {
    mirror: s.side === 'right' ? -1 : 1,
    sc: s.model_scale || 1,
    oX: s.side === 'left' ? s.X : s.X + s.DZ,
    oY: s.Y + s.DY,
    oZ: s.Z + s.DX,
    ax: s.model_anchor_x || 0,
    ay: s.model_anchor_y || 0,
    az: s.model_anchor_z || 0,
  }
}

// SVG path data for the filled true silhouette. Every triangle is projected and
// emitted as its own sub-path with consistent (positive) winding, so the union
// renders as one solid region under the nonzero fill rule — no internal seams,
// no winding cancellation in overlaps.
export function slideSilhouettePath(
  tris: Float32Array,
  s: SlidePlacement,
  project: (x: number, y: number, z: number) => P2,
): string {
  const { mirror, sc, oX, oY, oZ, ax, ay, az } = placement(s)
  let d = ''
  for (let i = 0; i < tris.length; i += 9) {
    const p: P2[] = []
    for (let k = 0; k < 3; k++) {
      const mx = tris[i + k * 3], my = tris[i + k * 3 + 1], mz = tris[i + k * 3 + 2]
      p.push(project(oX + ax + sc * mirror * mx, oY + ay + sc * my, oZ + az + sc * mz))
    }
    const area = (p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[2].x - p[0].x) * (p[1].y - p[0].y)
    if (Math.abs(area) < 1e-4) continue
    const o = area < 0 ? [p[0], p[2], p[1]] : p
    d += `M${o[0].x.toFixed(1)} ${o[0].y.toFixed(1)}L${o[1].x.toFixed(1)} ${o[1].y.toFixed(1)}L${o[2].x.toFixed(1)} ${o[2].y.toFixed(1)}Z`
  }
  return d
}

// TRUE silhouette outline (follows concavities and holes, unlike a convex hull).
// The projected triangle union is rasterized into a boolean grid, then marching
// squares extracts the filled/empty boundary as a set of short line segments.
// Returned as SVG path data (unstitched `M…L…` segments — fine for a stroked
// outline with round caps). `target` ≈ cells along the longer axis (resolution).
export function slideSilhouetteOutline(
  tris: Float32Array,
  s: SlidePlacement,
  project: (x: number, y: number, z: number) => P2,
  target = 170,
): string {
  const { mirror, sc, oX, oY, oZ, ax, ay, az } = placement(s)
  const P = (mx: number, my: number, mz: number) =>
    project(oX + ax + sc * mirror * mx, oY + ay + sc * my, oZ + az + sc * mz)

  // Project every (non-degenerate) triangle and track the screen-space bounds.
  const t2: number[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < tris.length; i += 9) {
    const a = P(tris[i], tris[i + 1], tris[i + 2])
    const b = P(tris[i + 3], tris[i + 4], tris[i + 5])
    const c = P(tris[i + 6], tris[i + 7], tris[i + 8])
    if (Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) < 1e-4) continue
    t2.push(a.x, a.y, b.x, b.y, c.x, c.y)
    minX = Math.min(minX, a.x, b.x, c.x); maxX = Math.max(maxX, a.x, b.x, c.x)
    minY = Math.min(minY, a.y, b.y, c.y); maxY = Math.max(maxY, a.y, b.y, c.y)
  }
  if (!t2.length) return ''

  const longer = Math.max(maxX - minX, maxY - minY) || 1
  const shorter = Math.min(maxX - minX, maxY - minY) || 1
  // Cell size must resolve the THINNEST real feature, not just the overall extent.
  // Slide profiles routinely have ~1mm-wide flanges/slivers (e.g. a rail wall that
  // narrows to 1mm down one side); a grid sized off the long axis samples those
  // away and they vanish from the traced outline. Aim for an absolute ~0.4mm cell
  // (≈2-3 samples across a 1mm feature), kept fine enough for the short axis too,
  // and never coarser than the long axis / cap nor finer than the cell cap allows.
  const MAX_CELLS = 900
  const cell0 = Math.max(longer / MAX_CELLS, Math.min(longer / target, shorter / 24, 0.4))
  minX -= cell0; minY -= cell0; maxX += cell0; maxY += cell0   // pad so edges close
  const cols = Math.min(MAX_CELLS, Math.max(2, Math.ceil((maxX - minX) / cell0)))
  const rows = Math.min(MAX_CELLS, Math.max(2, Math.ceil((maxY - minY) / cell0)))
  const cw = (maxX - minX) / cols, ch = (maxY - minY) / rows
  const gw = cols + 1, gh = rows + 1

  // Sample grid points: filled if inside any projected triangle.
  const mask = new Uint8Array(gw * gh)
  for (let t = 0; t < t2.length; t += 6) {
    const ax_ = t2[t], ay_ = t2[t + 1], bx = t2[t + 2], by = t2[t + 3], cx = t2[t + 4], cy = t2[t + 5]
    const det = (bx - ax_) * (cy - ay_) - (cx - ax_) * (by - ay_)
    if (det === 0) continue
    const c0 = Math.max(0, Math.floor((Math.min(ax_, bx, cx) - minX) / cw))
    const c1 = Math.min(gw - 1, Math.ceil((Math.max(ax_, bx, cx) - minX) / cw))
    const r0 = Math.max(0, Math.floor((Math.min(ay_, by, cy) - minY) / ch))
    const r1 = Math.min(gh - 1, Math.ceil((Math.max(ay_, by, cy) - minY) / ch))
    for (let r = r0; r <= r1; r++) {
      const py = minY + r * ch
      for (let c = c0; c <= c1; c++) {
        const idx = r * gw + c
        if (mask[idx]) continue
        const px = minX + c * cw
        const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / det
        const w1 = ((cx - px) * (ay_ - py) - (ax_ - px) * (cy - py)) / det
        if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) mask[idx] = 1
      }
    }
  }

  // Marching squares → boundary segments.
  let d = ''
  const seg = (p: P2, q: P2) => { d += `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${q.x.toFixed(1)} ${q.y.toFixed(1)}` }
  for (let r = 0; r < rows; r++) {
    const y0 = minY + r * ch, y1 = y0 + ch, ymid = y0 + ch / 2
    for (let c = 0; c < cols; c++) {
      const tl = mask[r * gw + c], tr = mask[r * gw + c + 1]
      const br = mask[(r + 1) * gw + c + 1], bl = mask[(r + 1) * gw + c]
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl
      if (code === 0 || code === 15) continue
      const x0 = minX + c * cw, x1 = x0 + cw, xmid = x0 + cw / 2
      const top = { x: xmid, y: y0 }, right = { x: x1, y: ymid }
      const bottom = { x: xmid, y: y1 }, left = { x: x0, y: ymid }
      switch (code) {
        case 1: case 14: seg(left, bottom); break
        case 2: case 13: seg(right, bottom); break
        case 3: case 12: seg(left, right); break
        case 4: case 11: seg(top, right); break
        case 6: case 9:  seg(top, bottom); break
        case 7: case 8:  seg(top, left); break
        case 5:  seg(top, right); seg(left, bottom); break
        case 10: seg(top, left); seg(right, bottom); break
      }
    }
  }
  return d
}
