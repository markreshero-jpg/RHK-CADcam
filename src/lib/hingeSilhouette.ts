'use client'

// ── Hinge silhouette + shared placement ───────────────────────────────────────
// Projects the combined hinge GLB (HingePlate + HingeCupArm) onto a 2D ortho
// plane so the modal's Top / Elevation / Side views can draw the hinge's true
// shape — exactly like slideSilhouette does for drawer slides.
//
// The placement constants/functions below are the SINGLE SOURCE OF TRUTH for
// where a hinge model sits; Cabinet3DView imports them too, so the 2D silhouette
// lands precisely over the 3D model.
//
// Combined-GLB convention: origin = plate-face bore centre, +Y = hinge axis
// (vertical), +Z = gable→door, mm units. Door box is cabinet coords
// (x = left edge, y = bottom, z = front plane, w = width, d = thickness).

import type { ResolvedHingeInstance } from './resolver/types'

// Depth seating: at HINGE_FRONT_FLUSH_NUDGE the cup's front-most face is flush
// with the door FRONT; the cup should instead bed CUP_DEPTH into the door from
// its BACK face, so we pull back an extra (thickness − CUP_DEPTH).
export const HINGE_FRONT_FLUSH_NUDGE = 30
export const HINGE_CUP_DEPTH_MM      = 13.5
// Measured cup-bore-centre X in the GLB (mm) — used to land the cup on the bore.
export const HINGE_MODEL_CUP_X       = 4.4

export function seatNudge(doorThickness: number): number {
  return HINGE_FRONT_FLUSH_NUDGE + (doorThickness - HINGE_CUP_DEPTH_MM)
}
export function cupAcrossOffset(cupXFromEdge: number, mirror: boolean, scale: number): number {
  const sx = mirror ? -1 : 1
  return -sx * (cupXFromEdge + HINGE_MODEL_CUP_X * (scale || 1))
}

export interface HingeDoorBox {
  x: number; y: number; z: number   // left edge / bottom / front plane (cabinet)
  w: number; d: number              // width / thickness
}

export interface HingePlacement {
  mirror: boolean
  scale:  number
  oX: number; oY: number; oZ: number   // model origin in cabinet coords (door closed)
}

// Model origin in cabinet coords for a closed door — matches the 3D placement
// (cup-arm local origin transformed by the door group at rotation 0).
export function hingePlacement(
  h: ResolvedHingeInstance,
  door: HingeDoorBox,
  hingeEdge: 'left' | 'right' | 'top' | 'bottom',
): HingePlacement {
  const mirror = hingeEdge === 'left'
  const scale  = h.model_scale || 1
  const hingeX = hingeEdge === 'left' ? door.x : door.x + door.w
  return {
    mirror, scale,
    oX: hingeX + cupAcrossOffset(h.cup_x_from_edge_mm, mirror, scale),
    oY: door.y + h.y_position_mm,
    oZ: door.z - ((h.bore_to_door_mm ?? 0) * scale + seatNudge(door.d)),
  }
}

type P2 = { x: number; y: number }

// Filled true silhouette — every triangle projected as its own consistently-wound
// sub-path so the union renders solid under the nonzero fill rule.
export function hingeSilhouettePath(
  tris: Float32Array,
  pl: HingePlacement,
  project: (x: number, y: number, z: number) => P2,
): string {
  const sx = pl.mirror ? -1 : 1
  let d = ''
  for (let i = 0; i < tris.length; i += 9) {
    const p: P2[] = []
    for (let k = 0; k < 3; k++) {
      const mx = tris[i + k * 3], my = tris[i + k * 3 + 1], mz = tris[i + k * 3 + 2]
      p.push(project(pl.oX + sx * pl.scale * mx, pl.oY + pl.scale * my, pl.oZ + pl.scale * mz))
    }
    const area = (p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[2].x - p[0].x) * (p[1].y - p[0].y)
    if (Math.abs(area) < 1e-4) continue
    const o = area < 0 ? [p[0], p[2], p[1]] : p
    d += `M${o[0].x.toFixed(1)} ${o[0].y.toFixed(1)}L${o[1].x.toFixed(1)} ${o[1].y.toFixed(1)}L${o[2].x.toFixed(1)} ${o[2].y.toFixed(1)}Z`
  }
  return d
}

// TRUE silhouette OUTLINE (boundary only — follows concavities/holes). The
// projected triangle union is rasterised into a boolean grid, then marching
// squares extracts the filled/empty boundary as short line segments. Mirrors
// slideSilhouetteOutline. `target` ≈ cells along the longer axis.
export function hingeSilhouetteOutline(
  tris: Float32Array,
  pl: HingePlacement,
  project: (x: number, y: number, z: number) => P2,
  target = 170,
): string {
  const sx = pl.mirror ? -1 : 1
  const P = (mx: number, my: number, mz: number) =>
    project(pl.oX + sx * pl.scale * mx, pl.oY + pl.scale * my, pl.oZ + pl.scale * mz)

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
  const MAX_CELLS = 900
  const cell0 = Math.max(longer / MAX_CELLS, Math.min(longer / target, shorter / 24, 0.4))
  minX -= cell0; minY -= cell0; maxX += cell0; maxY += cell0
  const cols = Math.min(MAX_CELLS, Math.max(2, Math.ceil((maxX - minX) / cell0)))
  const rows = Math.min(MAX_CELLS, Math.max(2, Math.ceil((maxY - minY) / cell0)))
  const cw = (maxX - minX) / cols, ch = (maxY - minY) / rows
  const gw = cols + 1, gh = rows + 1

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
