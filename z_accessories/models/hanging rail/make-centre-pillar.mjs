// Finista oval centre pillar (LS 7104019) as a GLB, built from the numbers we have
// (Mark 2026-11-03): 71.5 overall, plate 40 x 10 x 3 with holes 28.5 apart, stem 5
// wide on the face, ~3 wire oval ring round the 15 x 30 rail, rail centre 53.5 down.
// Origin = shelf underside at the pillar centre (AccessoryModel), +Y up so the
// pillar hangs into -Y; rail runs along X, ring in the Y-Z plane. Metres (scale 1000).
//   node "z_accessories/models/hanging rail/make-centre-pillar.mjs" [out.glb]
import fs from 'node:fs'

const MM = 0.001
const PLATE = { l: 40, w: 10, t: 3, holeC: 28.5, holeR: 2.25 }
const STEM = { face: 5, thick: 8 }               // face = across the depth (Z), thick = along the rail (X)
const RAIL = { w: 15, h: 30 }, WIRE = 3, DROP = 53.5, RING_X = 8
const SEG = 24

const tri = (arr, a, b, c) => arr.push(a, b, c)
const quad = (arr, a, b, c, d) => { tri(arr, a, b, c); tri(arr, a, c, d) }

// Plate: 40 (Z) x 10 (X) x 3 (Y), two round screw holes through it at Z = ±14.25.
function plate() {
  const t = [], y0 = -PLATE.t, y1 = 0, hx = PLATE.w / 2, hz = PLATE.l / 2
  const hc = PLATE.holeC / 2, r = PLATE.holeR
  // Solid bands between the holes, then a square band round each hole.
  const bands = [[-hz, -hc - r], [-hc + r, hc - r], [hc + r, hz]]
  const sqb = a => { const c = Math.cos(a), s = Math.sin(a); const k = Math.max(Math.abs(c) / hx, Math.abs(s) / r); return [c / k, s / k] }
  for (const [y, up] of [[y1, true], [y0, false]]) {
    for (const [z0, z1] of bands) up
      ? quad(t, [-hx, y, z0], [-hx, y, z1], [hx, y, z1], [hx, y, z0])
      : quad(t, [-hx, y, z0], [hx, y, z0], [hx, y, z1], [-hx, y, z1])
    for (const zc of [-hc, hc]) {
      for (let i = 0; i < SEG; i++) {
        const a0 = 2 * Math.PI * i / SEG, a1 = 2 * Math.PI * (i + 1) / SEG
        const c0 = [r * Math.cos(a0), r * Math.sin(a0)], c1 = [r * Math.cos(a1), r * Math.sin(a1)]
        const o0 = sqb(a0), o1 = sqb(a1)
        const P = ([x, z]) => [x, y, zc + z]
        if (up) quad(t, P(c0), P(o0), P(o1), P(c1)); else quad(t, P(c0), P(c1), P(o1), P(o0))
        if (up) quad(t, [c0[0], y0, zc + c0[1]], [c0[0], y1, zc + c0[1]], [c1[0], y1, zc + c1[1]], [c1[0], y0, zc + c1[1]])   // hole wall
      }
    }
  }
  quad(t, [-hx, y0, -hz], [-hx, y0, hz], [-hx, y1, hz], [-hx, y1, -hz])
  quad(t, [hx, y0, -hz], [hx, y1, -hz], [hx, y1, hz], [hx, y0, hz])
  quad(t, [-hx, y0, -hz], [-hx, y1, -hz], [hx, y1, -hz], [hx, y0, -hz])
  quad(t, [-hx, y0, hz], [hx, y0, hz], [hx, y1, hz], [-hx, y1, hz])
  return t
}

// Prism between an X-Z rectangle at y0 (half sizes x0, z0) and one at y1 (x1, z1).
function prism(y0, x0, z0, y1, x1, z1) {
  const t = []
  const b = [[-x0, y0, -z0], [x0, y0, -z0], [x0, y0, z0], [-x0, y0, z0]]
  const u = [[-x1, y1, -z1], [x1, y1, -z1], [x1, y1, z1], [-x1, y1, z1]]
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(t, b[i], b[j], u[j], u[i]) }
  quad(t, b[0], b[1], b[2], b[3]); quad(t, u[0], u[3], u[2], u[1])
  return t
}

// Stadium (oval) loop in Y-Z centred on cy: round top / bottom, straight sides. [y, z] points.
function stadium(cy, w, h) {
  const r = w / 2, s = (h - w) / 2, pts = []
  for (let i = 0; i < SEG; i++) { const a = Math.PI * i / SEG; pts.push([cy + s + r * Math.sin(a), r * Math.cos(a)]) }
  for (let i = 0; i < SEG; i++) { const a = Math.PI + Math.PI * i / SEG; pts.push([cy - s + r * Math.sin(a), r * Math.cos(a)]) }
  return pts
}
function ring() {
  const t = [], cy = -DROP, hx = RING_X / 2
  const inn = stadium(cy, RAIL.w, RAIL.h), out = stadium(cy, RAIL.w + 2 * WIRE, RAIL.h + 2 * WIRE)
  const O = (p, x) => [x, p[0], p[1]]
  for (let i = 0; i < inn.length; i++) {
    const j = (i + 1) % inn.length
    quad(t, O(out[i], -hx), O(out[j], -hx), O(out[j], hx), O(out[i], hx))   // outer wall
    quad(t, O(inn[i], -hx), O(inn[i], hx), O(inn[j], hx), O(inn[j], -hx))   // inner wall
    quad(t, O(out[i], hx), O(out[j], hx), O(inn[j], hx), O(inn[i], hx))     // +X face
    quad(t, O(out[i], -hx), O(inn[i], -hx), O(inn[j], -hx), O(out[j], -hx)) // -X face
  }
  return t
}

const ringTop = -DROP + (RAIL.h + 2 * WIRE) / 2           // -35.5
const meshes = [
  { name: 'Base_Flange', tris: plate() },
  { name: 'Stem', tris: [
    ...prism(ringTop + 8, STEM.thick / 2, STEM.face / 2, -PLATE.t, STEM.thick / 2, STEM.face / 2),
    ...prism(ringTop - 1, RING_X / 2, 6, ringTop + 8, STEM.thick / 2, STEM.face / 2),   // flare into the ring
  ] },
  { name: 'Oval_Ring', tris: ring() },
]

// ── GLB writer (non-indexed, flat normals, double-sided so winding can't hide a face) ──
const json = {
  asset: { version: '2.0', generator: 'RHK make-centre-pillar' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [],
  materials: [{ name: 'Chrome', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.81, 0.82, 0.83, 1], metallicFactor: 0.9, roughnessFactor: 0.25 } }],
}
const chunks = []; let off = 0
for (const m of meshes) {
  const v = m.tris, nTri = v.length / 3, pos = new Float32Array(v.length * 3), nor = new Float32Array(v.length * 3)
  for (let i = 0; i < nTri; i++) {
    const [a, b, c] = [v[3 * i], v[3 * i + 1], v[3 * i + 2]].map(p => p.map(q => q * MM))
    const u = b.map((q, k) => q - a[k]), w = c.map((q, k) => q - a[k])
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
    const L = Math.hypot(...n) || 1; n = n.map(q => q / L)
    ;[a, b, c].forEach((p, k) => { pos.set(p, (3 * i + k) * 3); nor.set(n, (3 * i + k) * 3) })
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]) }
  for (const [arr, extra] of [[pos, { min, max }], [nor, {}]]) {
    const buf = Buffer.from(arr.buffer); chunks.push(buf)
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, target: 34962 }); off += buf.length
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: 5126, count: arr.length / 3, type: 'VEC3', ...extra })
  }
  const ai = json.accessors.length
  json.meshes.push({ name: m.name, primitives: [{ attributes: { POSITION: ai - 2, NORMAL: ai - 1 }, material: 0 }] })
  json.nodes.push({ name: m.name, mesh: json.meshes.length - 1 }); json.scenes[0].nodes.push(json.nodes.length - 1)
}
json.buffers.push({ byteLength: off })
const bin = Buffer.concat(chunks)
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)])
const binP = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)])
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + binP.length, 8)
const ch = (b, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, b]) }
const out = process.argv[2] ?? new URL('./Finista_Oval_Centre_Pillar_Chrome.glb', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ')
fs.writeFileSync(out, Buffer.concat([head, ch(js, 0x4e4f534a), ch(binP, 0x004e4942)]))
console.log('wrote', out, '-', meshes.map(m => `${m.name} ${m.tris.length / 3} tris`).join(', '))
