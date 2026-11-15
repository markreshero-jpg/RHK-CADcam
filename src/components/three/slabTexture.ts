// Stone slab photo on a benchtop (z_benchtop_colours C4).
// The photo shows one whole slab (wMm × hMm). It is laid in plan at true size,
// its long side along the top's longest edge, so veins run on across the top,
// round its corners and down waterfall legs (box projection: each face takes the
// two axes it is most square to). Units = mm, Y up, plan x → X, plan y → Z.
import { useEffect, useState } from 'react'
import { BufferAttribute, type BufferGeometry, RepeatWrapping, SRGBColorSpace, type Texture, TextureLoader } from 'three'

const cache = new Map<string, Promise<Texture>>()

/** Shared texture per URL (loaded once, kept for the session). */
export function useSlabTexture(url: string | null | undefined): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null)
  useEffect(() => {
    if (!url) { setTex(null); return }
    let live = true
    let p = cache.get(url)
    if (!p) {
      p = new TextureLoader().loadAsync(url).then(t => {
        t.colorSpace = SRGBColorSpace
        t.wrapS = t.wrapT = RepeatWrapping
        t.anisotropy = 8
        return t
      })
      p.catch(() => cache.delete(url))
      cache.set(url, p)
    }
    p.then(t => { if (live) setTex(t) }, () => { if (live) setTex(null) })
    return () => { live = false }
  }, [url])
  return tex
}

/**
 * A non-indexed copy of `geo` with UVs in slab units: (0..1) = one slab.
 * `angle` = direction (radians, in plan) the slab's long side runs along.
 */
export function slabUvGeometry(geo: BufferGeometry, wMm: number, hMm: number, angle: number): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  const pos = g.getAttribute('position')
  const n = pos.count
  const uv = new Float32Array(n * 2)
  const c = Math.cos(angle), s = Math.sin(angle)
  // Local axes: a = along the slab's long side, b = across it (plan), y = up.
  const loc = (i: number) => {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    return [x * c + z * s, y, -x * s + z * c] as const
  }
  for (let t = 0; t + 2 < n; t += 3) {
    const p0 = loc(t), p1 = loc(t + 1), p2 = loc(t + 2)
    // Face normal in local axes → the dominant one picks the projection.
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2]
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2]
    const na = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nb = Math.abs(ux * vy - uy * vx)
    for (let k = 0; k < 3; k++) {
      const p = [p0, p1, p2][k]
      let u: number, v: number
      if (ny >= na && ny >= nb) { u = p[0] / wMm; v = p[2] / hMm }      // top / underside: plan
      else if (nb >= na) { u = p[0] / wMm; v = p[1] / hMm }             // faces across b: along a, up
      else { u = p[2] / hMm; v = p[1] / hMm }                           // ends: across, up
      uv[(t + k) * 2] = u
      uv[(t + k) * 2 + 1] = v
    }
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  return g
}
