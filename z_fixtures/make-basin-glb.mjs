// Builds a GLB for the white semi-recessed basin 530 x 360 (RHK6586, Unit 109
// plumbing spec p1): rounded-rectangle (superellipse) rim standing 65 above the
// top, bowl under the top, 180 overall to the bottom of the waste.
//   node z_fixtures/make-basin-glb.mjs public/fixture-models/RHK_Semi_Recessed_Basin_530x360.glb
// Metres, Y up (catalog model_scale 1000). The fixture fit centres it in X/Z and stands it on Y = 0.
import fs from 'node:fs'

const OUT = process.argv[2]
const SEG = 120
// Ring = superellipse half-sizes a (x) / b (z), exponent n (2 = circle), at height y.
// One continuous surface: waste pipe → outer bowl → rim → inner bowl → waste hole.
const R = (a, b, y, n = 2.8) => ({ a, b, y, n })
const body = [
  R(0.030, 0.030, 0.000, 2), R(0.030, 0.030, 0.040, 2),             // waste outlet pipe
  R(0.032, 0.032, 0.062, 2), R(0.060, 0.050, 0.068, 2.2),           // into the bowl underside
  R(0.120, 0.080, 0.071, 2.5), R(0.165, 0.100, 0.076),
  R(0.195, 0.118, 0.086), R(0.213, 0.130, 0.098), R(0.222, 0.138, 0.110),
  R(0.223, 0.140, 0.115),                                            // bowl meets the rim underside
  R(0.258, 0.173, 0.115), R(0.263, 0.178, 0.118),                   // rim underside → outer edge
  R(0.265, 0.180, 0.125), R(0.265, 0.180, 0.176),                   // rim outer wall (65 above the top)
  R(0.263, 0.178, 0.1795), R(0.258, 0.173, 0.180),                  // rounded top edge
  R(0.250, 0.165, 0.180), R(0.246, 0.161, 0.1785),                  // rim top → inner lip
  R(0.240, 0.155, 0.172), R(0.226, 0.143, 0.155),                   // inner bowl
  R(0.205, 0.126, 0.135), R(0.172, 0.103, 0.114), R(0.128, 0.076, 0.097, 2.6),
  R(0.080, 0.052, 0.088, 2.3), R(0.040, 0.040, 0.084, 2), R(0.024, 0.024, 0.083, 2),
  R(0.024, 0.024, 0.060, 2),                                         // waste hole
]
const ringPt = (r, t) => {
  const c = Math.cos(t), s = Math.sin(t), e = 2 / r.n
  return [r.a * Math.sign(c) * Math.abs(c) ** e, r.y, r.b * Math.sign(s) * Math.abs(s) ** e]
}

function lathe(rings, capStart, capEnd) {
  const pos = [], idx = []
  for (const r of rings) for (let i = 0; i < SEG; i++) pos.push(...ringPt(r, (i / SEG) * 2 * Math.PI))
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < SEG; i++) {
    const a = k * SEG + i, b = k * SEG + (i + 1) % SEG, c = a + SEG, d = b + SEG
    idx.push(a, c, b, b, c, d)
  }
  const cap = (k, flip) => {
    const ctr = pos.length / 3
    pos.push(0, rings[k].y, 0)
    for (let i = 0; i < SEG; i++) {
      const a = k * SEG + i, b = k * SEG + (i + 1) % SEG
      flip ? idx.push(ctr, b, a) : idx.push(ctr, a, b)
    }
  }
  if (capStart) cap(0, false)
  if (capEnd) cap(rings.length - 1, true)
  return { pos, idx }
}

// Smooth normals, oriented away from the axis on walls (the mesh is double-sided anyway).
function normals(pos, idx) {
  const n = new Float32Array(pos.length)
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3]
    const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]]
    const v = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]]
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    for (const p of [a, b, c]) { n[p] += f[0]; n[p + 1] += f[1]; n[p + 2] += f[2] }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l
  }
  return n
}

const meshes = [
  { name: 'Basin', ...lathe(body, true, true), color: [0.96, 0.96, 0.95, 1], metallic: 0, rough: 0.25 },
  // Chrome waste in the bottom of the bowl.
  { name: 'Waste', ...lathe([R(0.033, 0.033, 0.0838, 2), R(0.033, 0.033, 0.0852, 2), R(0.030, 0.030, 0.0858, 2)], false, true),
    color: [0.8, 0.8, 0.82, 1], metallic: 1, rough: 0.2 },
]

// ── Minimal GLB writer ──
const chunks = [], views = [], accessors = [], gltfMeshes = [], materials = [], nodes = []
let offset = 0
const addView = (buf, target) => {
  const pad = (4 - (buf.length % 4)) % 4
  chunks.push(buf, Buffer.alloc(pad))
  views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target })
  offset += buf.length + pad
  return views.length - 1
}
for (const m of meshes) {
  const P = new Float32Array(m.pos), N = normals(m.pos, m.idx), I = new Uint32Array(m.idx)
  const min = [0, 1, 2].map(k => Math.min(...P.filter((_, i) => i % 3 === k)))
  const max = [0, 1, 2].map(k => Math.max(...P.filter((_, i) => i % 3 === k)))
  const pa = accessors.push({ bufferView: addView(Buffer.from(P.buffer), 34962), componentType: 5126, count: P.length / 3, type: 'VEC3', min, max }) - 1
  const na = accessors.push({ bufferView: addView(Buffer.from(N.buffer), 34962), componentType: 5126, count: N.length / 3, type: 'VEC3' }) - 1
  const ia = accessors.push({ bufferView: addView(Buffer.from(I.buffer), 34963), componentType: 5125, count: I.length, type: 'SCALAR' }) - 1
  const mat = materials.push({ name: m.name, doubleSided: true,
    pbrMetallicRoughness: { baseColorFactor: m.color, metallicFactor: m.metallic, roughnessFactor: m.rough } }) - 1
  const mesh = gltfMeshes.push({ name: m.name, primitives: [{ attributes: { POSITION: pa, NORMAL: na }, indices: ia, material: mat }] }) - 1
  nodes.push({ name: m.name, mesh })
}
const bin = Buffer.concat(chunks)
const json = { asset: { version: '2.0', generator: 'RHK-CADcam make-basin-glb' }, scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes: gltfMeshes, materials, accessors,
  bufferViews: views, buffers: [{ byteLength: bin.length }] }
let js = Buffer.from(JSON.stringify(json))
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)])
const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8)
jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4)
bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4)
fs.writeFileSync(OUT, Buffer.concat([header, jh, js, bh, bin]))
console.log('wrote', OUT, Buffer.concat([header, jh, js, bh, bin]).length, 'bytes')
