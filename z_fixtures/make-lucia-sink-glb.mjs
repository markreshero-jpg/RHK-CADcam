// Builds a GLB for the Abey Lucia LUA190 1 3/4 bowl sink (RHK6595, Mark 2026-11-08), from the Abey spec sheet:
// overall 608 x 440, bowls 340 x 400 x 200 deep (left) + 225 x 400 x 160 deep (right), R15 corners, 2 x 90 wastes,
// pressed SUS304, inset / undermount. Writes the GLB and prints the catalog plan_shape / elev_shape JSON.
//   node z_fixtures/make-lucia-sink-glb.mjs public/fixture-models/Abey_Lucia_LUA190.glb z_fixtures/Abey_Lucia_LUA190.shapes.json
// Metres, Y up (catalog model_scale 1000); the fixture fit centres it in X/Z and stands it on Y = 0.
// X = across (big bowl at -X = left seen from the front), Z = depth (+Z = front), Y = up, flange top at 0.200.
import fs from 'node:fs'

const OUT = process.argv[2]
const SEG = 160
const W = 0.608, D = 0.440, TOP = 0.200, FL = 0.009, DIV = 0.025
const bowls = [
  { cx: -W / 2 + FL + 0.170, a: 0.170, b: 0.200, depth: 0.200 },          // 340 x 400 x 200
  { cx: W / 2 - FL - 0.1125, a: 0.1125, b: 0.200, depth: 0.160 },         // 225 x 400 x 160
]
const xDiv = -W / 2 + FL + 0.340 + DIV / 2                                 // divider centre line
// Superellipse ring (half-sizes a x b, exponent n; high n = rounded rectangle) centred at cx, at height y.
const R = (cx, a, b, y, n = 22) => ({ cx, a, b, y, n })
const ringPt = (r, t) => {
  const c = Math.cos(t), s = Math.sin(t), e = 2 / r.n
  return [r.cx + r.a * Math.sign(c) * Math.abs(c) ** e, r.y, r.b * Math.sign(s) * Math.abs(s) ** e]
}
function loft(rings, capEnd) {
  const pos = [], idx = []
  for (const r of rings) for (let i = 0; i < SEG; i++) pos.push(...ringPt(r, (i / SEG) * 2 * Math.PI))
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < SEG; i++) {
    const a = k * SEG + i, b = k * SEG + (i + 1) % SEG, c = a + SEG, d = b + SEG
    idx.push(a, c, b, b, c, d)
  }
  if (capEnd) {
    const k = rings.length - 1, ctr = pos.length / 3
    pos.push(rings[k].cx, rings[k].y, 0)
    for (let i = 0; i < SEG; i++) idx.push(ctr, k * SEG + (i + 1) % SEG, k * SEG + i)
  }
  return { pos, idx }
}
const merge = parts => {
  const pos = [], idx = []
  for (const p of parts) { const o = pos.length / 3; pos.push(...p.pos); idx.push(...p.idx.map(i => i + o)) }
  return { pos, idx }
}
const steel = [], chrome = []
for (const [i, bw] of bowls.entries()) {
  const bot = TOP - bw.depth
  // Flange: from the bowl rim out to its half of the sink (near-square outer ring), then the turned-down edge.
  const left = i === 0 ? -W / 2 : xDiv, right = i === 0 ? xDiv : W / 2
  const oc = (left + right) / 2, oa = (right - left) / 2
  steel.push(loft([R(bw.cx, bw.a, bw.b, TOP), R(oc, oa, D / 2, TOP, 80), R(oc, oa, D / 2, TOP - 0.008, 80)], false))
  // Bowl: wall, R15 into the bottom, bottom plate to the 90 waste hole.
  steel.push(loft([
    R(bw.cx, bw.a, bw.b, TOP), R(bw.cx, bw.a, bw.b, bot + 0.015),
    R(bw.cx, bw.a - 0.004, bw.b - 0.004, bot + 0.004), R(bw.cx, bw.a - 0.015, bw.b - 0.015, bot),
    R(bw.cx, 0.045, 0.045, bot, 2),
  ], false))
  // Basket waste: chrome collar + strainer.
  chrome.push(loft([R(bw.cx, 0.045, 0.045, bot + 0.002, 2), R(bw.cx, 0.041, 0.041, bot + 0.002, 2),
    R(bw.cx, 0.041, 0.041, bot + 0.0005, 2), R(bw.cx, 0.036, 0.036, bot + 0.0005, 2)], true))   // kept above the bowl bottom (Y min = 0)
}
const meshes = [
  { name: 'Sink', ...merge(steel), color: [0.80, 0.81, 0.83, 1], metallic: 1, rough: 0.32 },
  { name: 'Wastes', ...merge(chrome), color: [0.88, 0.88, 0.9, 1], metallic: 1, rough: 0.15 },
]

function normals(pos, idx) {
  const n = new Float32Array(pos.length)
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3]
    const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]]
    const v = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]]
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    for (const p of [a, b, c]) { n[p] += f[0]; n[p + 1] += f[1]; n[p + 2] += f[2] }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l }
  return n
}

// ── Minimal GLB writer (as make-basin-glb.mjs) ──
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
  const min = [0, 1, 2].map(k => { let v = Infinity; for (let i = k; i < P.length; i += 3) v = Math.min(v, P[i]); return v })
  const max = [0, 1, 2].map(k => { let v = -Infinity; for (let i = k; i < P.length; i += 3) v = Math.max(v, P[i]); return v })
  const pa = accessors.push({ bufferView: addView(Buffer.from(P.buffer), 34962), componentType: 5126, count: P.length / 3, type: 'VEC3', min, max }) - 1
  const na = accessors.push({ bufferView: addView(Buffer.from(N.buffer), 34962), componentType: 5126, count: N.length / 3, type: 'VEC3' }) - 1
  const ia = accessors.push({ bufferView: addView(Buffer.from(I.buffer), 34963), componentType: 5125, count: I.length, type: 'SCALAR' }) - 1
  const mat = materials.push({ name: m.name, doubleSided: true,
    pbrMetallicRoughness: { baseColorFactor: m.color, metallicFactor: m.metallic, roughnessFactor: m.rough } }) - 1
  const mesh = gltfMeshes.push({ name: m.name, primitives: [{ attributes: { POSITION: pa, NORMAL: na }, indices: ia, material: mat }] }) - 1
  nodes.push({ name: m.name, mesh })
}
const bin = Buffer.concat(chunks)
const json = { asset: { version: '2.0', generator: 'RHK-CADcam make-lucia-sink-glb' }, scene: 0,
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

// ── 2D outlines for the catalog (normalised 0..1; plan: x across, y front→back; elevation: y down from the top) ──
const r4 = v => Math.round(v * 10000) / 10000
const nx = x => r4((x + W / 2) / W), nz = z => r4((z + D / 2) / D)
const ring2d = (cx, a, b, n, pts = 48) => Array.from({ length: pts + 1 }, (_, i) => {
  const t = (i / pts) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t), e = 2 / n
  return [nx(cx + a * Math.sign(c) * Math.abs(c) ** e), nz(b * Math.sign(s) * Math.abs(s) ** e)]
})
const plan = { v: 1, lines: [
  [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
  ...bowls.map(b => ring2d(b.cx, b.a, b.b, 22)),
  ...bowls.map(b => ring2d(b.cx, 0.045, 0.045, 2, 24)),
] }
const ny = y => r4((TOP - y) / TOP)
const elev = { v: 1, lines: [
  [[0, 0], [1, 0], [1, ny(TOP - 0.008)], [0, ny(TOP - 0.008)], [0, 0]],
  ...bowls.map(b => {
    const x0 = b.cx - b.a, x1 = b.cx + b.a, bot = TOP - b.depth
    return [[nx(x0), ny(TOP - 0.008)], [nx(x0), ny(bot + 0.015)], [nx(x0 + 0.015), ny(bot)], [nx(x1 - 0.015), ny(bot)], [nx(x1), ny(bot + 0.015)], [nx(x1), ny(TOP - 0.008)]]
  }),
] }
const SHAPES = process.argv[3] ?? OUT.replace(/\.glb$/, '.shapes.json')
fs.writeFileSync(SHAPES, JSON.stringify({ plan_shape: plan, elev_shape: elev }))
console.log('shapes', SHAPES)
