// Builds a GLB for the BeefEater Proline integrated BBQ with roasting hood, BSH158
// (BMAN Proline manual Jun26 pp 4 + 12–13), drawn with the HOOD OPEN.
//   node z_fixtures/make-beefeater-bsh-glb.mjs public/fixture-models/BeefEater_Proline_BSH158_HoodOpen.glb
// Sizes from the manual: flange 1053 × 540, hood 924 wide (212 above the top closed),
// body 177 below the top × 464 deep, cut-out 1025 × 502, hood open 615 above the top
// with its back 59 behind the cut-out (71 min to a splashback).
// Model frame (mm here, written in metres, Y up, +Z front, catalog model_scale 1000):
// y 0 = benchtop surface, flange back edge z 0, flange left edge x 0.
import fs from 'node:fs'

const OUT = process.argv[2]
const meshes = new Map() // material name → { pos: [], mat }
// Low metalness on purpose: the canvas 3D has no environment map, so true metals render near black.
const MATS = {
  Stainless: { color: [0.78, 0.79, 0.80, 1], metallic: 0.25, rough: 0.35 },
  StainlessDark: { color: [0.6, 0.61, 0.62, 1], metallic: 0.25, rough: 0.5 },
  CastIron: { color: [0.07, 0.07, 0.07, 1], metallic: 0.4, rough: 0.75 },
  Knob: { color: [0.85, 0.86, 0.87, 1], metallic: 0.3, rough: 0.2 },
  Black: { color: [0.03, 0.03, 0.03, 1], metallic: 0, rough: 0.6 },
}
const tri = (m, a, b, c) => {
  if (!meshes.has(m)) meshes.set(m, { pos: [] })
  meshes.get(m).pos.push(...a, ...b, ...c)
}
const quad = (m, a, b, c, d) => { tri(m, a, b, c); tri(m, a, c, d) }

// Convex polygon in the (z, y) plane, extruded from x0 to x1. pts as [z, y].
function prismX(m, pts, x0, x1, xf = p => p) {
  const P = (x, [z, y]) => xf([x, y, z])
  for (let i = 1; i < pts.length - 1; i++) {
    tri(m, P(x0, pts[0]), P(x0, pts[i + 1]), P(x0, pts[i]))
    tri(m, P(x1, pts[0]), P(x1, pts[i]), P(x1, pts[i + 1]))
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    quad(m, P(x0, a), P(x1, a), P(x1, b), P(x0, b))
  }
}
const box = (m, x0, x1, y0, y1, z0, z1, xf) => prismX(m, [[z0, y0], [z1, y0], [z1, y1], [z0, y1]], x0, x1, xf)

// Thin plate along a (z, y) polyline, thickness t to the left of travel, x0..x1.
function shellX(m, line, t, x0, x1, xf) {
  for (let i = 0; i < line.length - 1; i++) {
    const [z0, y0] = line[i], [z1, y1] = line[i + 1]
    const l = Math.hypot(z1 - z0, y1 - y0), nz = -(y1 - y0) / l * t, ny = (z1 - z0) / l * t
    prismX(m, [[z0, y0], [z1, y1], [z1 + nz, y1 + ny], [z0 + nz, y0 + ny]], x0, x1, xf)
  }
}

// Cylinder from point a to point b (mm), radius r.
function cyl(m, a, b, r, seg = 24, xf = p => p) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d)
  const w = d.map(v => v / L)
  const h = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  let u = [w[1] * h[2] - w[2] * h[1], w[2] * h[0] - w[0] * h[2], w[0] * h[1] - w[1] * h[0]]
  const ul = Math.hypot(...u); u = u.map(v => v / ul)
  const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]]
  const ring = (c, t) => [0, 1, 2].map(k => c[k] + r * (Math.cos(t) * u[k] + Math.sin(t) * v[k]))
  for (let i = 0; i < seg; i++) {
    const t0 = (i / seg) * 2 * Math.PI, t1 = ((i + 1) / seg) * 2 * Math.PI
    const a0 = xf(ring(a, t0)), a1 = xf(ring(a, t1)), b0 = xf(ring(b, t0)), b1 = xf(ring(b, t1))
    quad(m, a0, a1, b1, b0)
    tri(m, xf(a), a1, a0); tri(m, xf(b), b0, b1)
  }
}

// ── Below the top: body in the 1025 × 502 cut-out ──
const FW = 1053, FD = 540
const cutZ0 = (FD - 502) / 2                       // cut-out centred in the flange depth (19)
box('StainlessDark', 26.5, FW - 26.5, -177, -3, cutZ0 + 19, cutZ0 + 19 + 464)
// Vent slots on the body front (2 rows of 4, as drawn)
for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
  const x = 330 + i * 125, y = -150 + r * 22
  box('Black', x, x + 95, y, y + 9, cutZ0 + 19 + 464, cutZ0 + 19 + 465)
}
// Gas inlet elbow under the right-hand end
cyl('Knob', [FW - 90, -60, 330], [FW - 90, -150, 330], 11)
cyl('Knob', [FW - 90, -150, 330], [FW - 90, -150, 400], 11)

// ── On the top: flange, cookbox, cooking surfaces, controls ──
box('Stainless', 0, FW, 0, 3, 0, FD)                       // trim flange sitting on the bench
// Cookbox walls (rim 70 above the top), 924 hood footprint on the left
const HX0 = 20, HX1 = HX0 + 924, BZ0 = 30, BZ1 = 470
box('Stainless', HX0, HX1, 3, 70, BZ0, BZ0 + 12)          // back wall
box('Stainless', HX0, HX0 + 12, 3, 70, BZ0, BZ1)          // left
box('Stainless', HX1 - 12, HX1, 3, 70, BZ0, BZ1)          // right
prismX('Stainless', [[BZ1 - 12, 3], [BZ1 + 40, 3], [BZ1 + 40, 25], [BZ1, 70], [BZ1 - 12, 70]], HX0, HX1) // sloped front fascia
// Grill | hotplate | grill (cast iron), surface 45 above the top
const cx0 = HX0 + 12, cx1 = HX1 - 12, sec = (cx1 - cx0) / 3
for (const s of [0, 2]) {
  const x0 = cx0 + s * sec + 6, x1 = cx0 + (s + 1) * sec - 6
  box('CastIron', x0, x1, 30, 36, BZ0 + 18, BZ1 - 18)      // grill frame floor
  for (let z = BZ0 + 30; z < BZ1 - 30; z += 22) box('CastIron', x0, x1, 36, 46, z, z + 11)
}
box('CastIron', cx0 + sec + 3, cx0 + 2 * sec - 3, 30, 45, BZ0 + 18, BZ1 - 18) // hotplate
box('Black', cx0, cx1, 8, 30, BZ0 + 12, BZ1 - 12)         // dark firebox below the surfaces
// Control strip on the right of the cookbox: 4 knobs face up, front of the flange
box('Stainless', HX1, FW - 6, 3, 34, BZ0 + 12, FD - 8)
for (let i = 0; i < 4; i++) {
  const z = 140 + i * 95
  cyl('Knob', [HX1 + 52, 34, z], [HX1 + 52, 62, z], 23)
  box('Black', HX1 + 49, HX1 + 55, 62, 63, z - 18, z + 4)
}

// ── Roasting hood, drawn closed then swung open about its rear hinge ──
// Closed side profile (z, y): back up from the rim, flat top, sloped front to the lip.
const hoodLine = [[BZ0 + 8, 72], [BZ0 + 8, 212], [360, 212], [FD + 18, 110], [FD + 18, 72]]
const HINGE = [70, 104]                                    // (z, y) of the pivot; sets 615 high open, back 59 behind the cut-out
const OPEN = 86 * Math.PI / 180
const swing = ([x, y, z]) => {
  const dz = z - HINGE[0], dy = y - HINGE[1], c = Math.cos(OPEN), s = Math.sin(OPEN)
  return [x, HINGE[1] + dz * s + dy * c, HINGE[0] + dz * c - dy * s]
}
shellX('Stainless', hoodLine, 2.5, HX0 + 2, HX1 - 2, swing)          // wrap: back, top, slope, lip
prismX('Stainless', hoodLine, HX0, HX0 + 2.5, swing)                 // side cheeks (closed profile)
prismX('Stainless', hoodLine, HX1 - 2.5, HX1, swing)
// Warming rack inside the hood
box('StainlessDark', HX0 + 20, HX1 - 20, 150, 152, BZ0 + 20, BZ0 + 130, swing)
for (let x = HX0 + 30; x < HX1 - 20; x += 40) box('StainlessDark', x, x + 3, 150, 160, BZ0 + 20, BZ0 + 130, swing)
// Thermometer on the sloped front + handle bar on stand-offs
{
  const zc = 455, yc = 161, n = [212 - 110, FD + 18 - 360], nl = Math.hypot(...n)
  const out = [n[0] / nl, n[1] / nl]                       // outward normal of the slope (z, y)
  cyl('Black', [HX0 + 462, yc, zc], [HX0 + 462, yc + out[1] * 6, zc + out[0] * 6], 32, 32, swing)
  cyl('Knob', [HX0 + 462, yc + out[1] * 6, zc + out[0] * 6], [HX0 + 462, yc + out[1] * 7, zc + out[0] * 7], 26, 32, swing)
}
for (const x of [HX0 + 90, HX1 - 90]) cyl('Stainless', [x, 92, FD + 18], [x, 92, FD + 42], 7, 16, swing)
cyl('Stainless', [HX0 + 70, 92, FD + 42], [HX1 - 70, 92, FD + 42], 11, 24, swing)
// Hinge brackets
for (const x of [HX0 - 4, HX1]) prismX('StainlessDark', [[BZ0 - 6, 3], [BZ0 + 44, 3], [BZ0 + 30, 135], [BZ0 + 6, 135]], x, x + 4)

// ── Write ──
const all = [...meshes.values()].flatMap(m => m.pos)
const bb = [0, 1, 2].map(k => { const v = all.filter((_, i) => i % 3 === k); return [Math.min(...v), Math.max(...v)] })
console.log('bbox mm  x', bb[0].map(Math.round), ' y', bb[1].map(Math.round), ' z', bb[2].map(Math.round))
console.log('size mm ', bb.map(([a, b]) => Math.round((b - a) * 10) / 10).join(' × '), '(w × h × d)')

const chunks = [], views = [], accessors = [], gltfMeshes = [], materials = [], nodes = []
let offset = 0
const addView = (buf, target) => {
  const pad = (4 - (buf.length % 4)) % 4
  chunks.push(buf, Buffer.alloc(pad))
  views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target })
  offset += buf.length + pad
  return views.length - 1
}
for (const [name, m] of meshes) {
  const P = new Float32Array(m.pos.map(v => v / 1000))
  const N = new Float32Array(P.length)                    // flat normals (vertices are per-triangle)
  for (let i = 0; i < P.length; i += 9) {
    const u = [P[i + 3] - P[i], P[i + 4] - P[i + 1], P[i + 5] - P[i + 2]]
    const v = [P[i + 6] - P[i], P[i + 7] - P[i + 1], P[i + 8] - P[i + 2]]
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const l = Math.hypot(...f) || 1
    for (let k = 0; k < 3; k++) N.set(f.map(c => c / l), i + k * 3)
  }
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[i + k]); max[k] = Math.max(max[k], P[i + k]) }
  const pa = accessors.push({ bufferView: addView(Buffer.from(P.buffer), 34962), componentType: 5126, count: P.length / 3, type: 'VEC3', min, max }) - 1
  const na = accessors.push({ bufferView: addView(Buffer.from(N.buffer), 34962), componentType: 5126, count: N.length / 3, type: 'VEC3' }) - 1
  const mm = MATS[name]
  const mat = materials.push({ name, doubleSided: true,
    pbrMetallicRoughness: { baseColorFactor: mm.color, metallicFactor: mm.metallic, roughnessFactor: mm.rough } }) - 1
  const mesh = gltfMeshes.push({ name, primitives: [{ attributes: { POSITION: pa, NORMAL: na }, material: mat }] }) - 1
  nodes.push({ name, mesh })
}
const bin = Buffer.concat(chunks)
const json = { asset: { version: '2.0', generator: 'RHK-CADcam make-beefeater-bsh-glb' }, scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes: gltfMeshes, materials, accessors,
  bufferViews: views, buffers: [{ byteLength: bin.length }] }
let js = Buffer.from(JSON.stringify(json))
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)])
const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8)
jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4)
bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4)
const glb = Buffer.concat([header, jh, js, bh, bin])
fs.writeFileSync(OUT, glb)
console.log('wrote', OUT, glb.length, 'bytes')
