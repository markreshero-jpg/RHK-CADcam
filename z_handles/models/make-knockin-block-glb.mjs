// Builds a GLB for the Furnware CCP knock-down connector (plastic, white) — the
// knock-in nylon block that holds a finger-pull rail in its notch (z_handles §7).
// Sizes from Furnware's line drawing (CCP_Line.jpg):
//   body 19 wide x 11.9 high, 16.9 long on top / 20.4 on the bottom (sloped end),
//   Ø6 screw hole along its length, Ø9.5 counterbore in the sloped end,
//   ribbed peg Ø10.1 x 9.5 under the body, centred ~14.5 from the square end.
//   node z_handles/models/make-knockin-block-glb.mjs z_handles/models/Furnware_CCP_Knockin_Block.glb
// Metres, Y up. Origin = peg axis on the body's underside (the gable face the
// block sits on): the peg runs down -Y into the gable's Ø10 hole (RAILBLKD/Z),
// the square end (screw goes through it into the rail) faces -X.
import fs from 'node:fs'

const OUT = process.argv[2]
const mm = v => v / 1000
const SEG = 48
const PEG_X = 14.5                 // square end → peg centre
const X0 = -PEG_X, TOP_X1 = X0 + 16.9, BOT_X1 = X0 + 20.4, H = 11.9, W2 = 19 / 2

// ── Body: the side profile (square end, sloped far end) extruded 19 wide ──
function body() {
  const prof = [[X0, 0], [BOT_X1, 0], [TOP_X1, H], [X0, H]]   // CCW seen from +Z
  const pos = [], idx = []
  const quad = (a, b, c, d) => { const s = pos.length / 3; pos.push(...a, ...b, ...c, ...d); idx.push(s, s + 1, s + 2, s, s + 2, s + 3) }
  const P = (p, z) => [mm(p[0]), mm(p[1]), mm(z)]
  quad(P(prof[0], W2), P(prof[1], W2), P(prof[2], W2), P(prof[3], W2))        // +Z side
  quad(P(prof[0], -W2), P(prof[3], -W2), P(prof[2], -W2), P(prof[1], -W2))    // -Z side
  for (let i = 0; i < 4; i++) {
    const a = prof[i], b = prof[(i + 1) % 4]
    quad(P(a, -W2), P(b, -W2), P(b, W2), P(a, W2))
  }
  return { pos, idx, flat: true }
}

// ── Cylinder along an axis (rings of radius r at distance t along the axis) ──
function lathe(rings, origin, axis, u, v, capStart, capEnd) {
  const pos = [], idx = []
  const at = (r, t, a) => [0, 1, 2].map(k => origin[k] + axis[k] * t + (u[k] * Math.cos(a) + v[k] * Math.sin(a)) * r)
  for (const [r, t] of rings) for (let i = 0; i < SEG; i++) pos.push(...at(r, t, (i / SEG) * 2 * Math.PI).map(mm))
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < SEG; i++) {
    const a = k * SEG + i, b = k * SEG + (i + 1) % SEG, c = a + SEG, d = b + SEG
    idx.push(a, c, b, b, c, d)
  }
  const cap = (k, flip) => {
    const ctr = pos.length / 3
    pos.push(...at(0, rings[k][1], 0).map(mm))
    for (let i = 0; i < SEG; i++) {
      const a = k * SEG + i, b = k * SEG + (i + 1) % SEG
      flip ? idx.push(ctr, b, a) : idx.push(ctr, a, b)
    }
  }
  if (capStart) cap(0, false)
  if (capEnd) cap(rings.length - 1, true)
  return { pos, idx }
}

// Peg: three barbs (Ø10.1 tapering in to Ø9) on a Ø9 core, 9.5 long, down -Y.
const pegRings = [[4.5, 0], [4.5, 1.2]]
for (let k = 0; k < 3; k++) { const t = 1.2 + k * 2.75; pegRings.push([5.05, t + 0.4], [4.5, t + 2.75]) }
pegRings[pegRings.length - 1][1] = 9.5
const peg = lathe(pegRings, [0, 0, 0], [0, -1, 0], [1, 0, 0], [0, 0, 1], false, true)

// Holes: dark discs a hair proud of the faces — Ø6 on the square end, Ø9.5
// counterbore with a Ø6 bottom on the slope (axis at mid-height, along X).
const slopeN = (() => { const dx = H, dy = BOT_X1 - TOP_X1, l = Math.hypot(dx, dy); return [dx / l, dy / l, 0] })()
const slopeX = (BOT_X1 + TOP_X1) / 2 + 0.05 * slopeN[0], slopeY = H / 2 + 0.05 * slopeN[1]
const holeEnd = lathe([[0, 0], [3, 0]], [X0 - 0.05, H / 2, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], false, false)
const cbore = lathe([[3, 0], [4.75, 0]], [slopeX, slopeY, 0], slopeN, [0, 0, 1], [-slopeN[1], slopeN[0], 0], false, false)
const cboreIn = lathe([[0, 0], [3, 0]], [slopeX, slopeY, 0], slopeN, [0, 0, 1], [-slopeN[1], slopeN[0], 0], false, false)

const WHITE = [0.95, 0.95, 0.93, 1], SHADE = [0.78, 0.78, 0.76, 1], DARK = [0.25, 0.25, 0.25, 1]
const meshes = [
  { name: 'Body', ...body(), color: WHITE },
  { name: 'Peg', ...peg, color: WHITE },
  { name: 'ScrewHole', ...holeEnd, color: DARK },
  { name: 'Counterbore', ...cbore, color: SHADE },
  { name: 'CounterboreHole', ...cboreIn, color: DARK },
]

// Normals: per-vertex average (flat for the body — its quads don't share vertices).
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

// ── Minimal GLB writer (as z_fixtures/make-basin-glb.mjs) ──
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
    pbrMetallicRoughness: { baseColorFactor: m.color, metallicFactor: 0, roughnessFactor: 0.6 } }) - 1
  const mesh = gltfMeshes.push({ name: m.name, primitives: [{ attributes: { POSITION: pa, NORMAL: na }, indices: ia, material: mat }] }) - 1
  nodes.push({ name: m.name, mesh })
}
const bin = Buffer.concat(chunks)
const json = { asset: { version: '2.0', generator: 'RHK-CADcam make-knockin-block-glb' }, scene: 0,
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
