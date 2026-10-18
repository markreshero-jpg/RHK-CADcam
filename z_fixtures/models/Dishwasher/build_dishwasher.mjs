// Parametric freestanding dishwasher → GLB (z_fixtures).
//   node z_fixtures/models/Dishwasher/build_dishwasher.mjs [width] [depth] [height]
// Defaults 600 × 600 × 850 (mm). Units are mm (model_scale 1). Frame matches the
// fixture item box: origin back-bottom-left, +X width, +Y up, +Z toward the front.
// Generic look only — stainless door + body, dark control strip with display,
// bar handle, recessed black kick, four feet. Built from flat-shaded boxes, so
// no dependencies: the GLB is written by hand.

import fs from 'node:fs'
import path from 'node:path'

const [W = 600, D = 600, H = 850] = process.argv.slice(2).map(Number)
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')),
  `generic-dishwasher-${W}-freestanding.glb`)

// name → [r, g, b, metallic, roughness]. Low metallic: the room viewer has no
// environment map, so real metal values render near-black.
const MATERIALS = {
  stainless: [0.74, 0.76, 0.78, 0.15, 0.35],
  top:       [0.86, 0.86, 0.86, 0.0,  0.6],
  panel:     [0.12, 0.13, 0.15, 0.1,  0.4],
  display:   [0.03, 0.04, 0.05, 0.0,  0.2],
  handle:    [0.35, 0.37, 0.40, 0.3,  0.3],
  kick:      [0.10, 0.10, 0.10, 0.0,  0.8],
}

// Overall depth D includes the handle, so the bbox fits the item box exactly.
const KICK = 90, TOP = 20, DOOR_T = 24, GAP = 2, HANDLE = 24
const doorZ1 = D - HANDLE, doorZ0 = doorZ1 - DOOR_T
// [material, x0, y0, z0, x1, y1, z1]
const boxes = [
  ['stainless', 0, KICK, 0, W, H - TOP, doorZ0],                              // body
  ['top',       0, H - TOP, 0, W, H, doorZ1],                                // worktop
  ['stainless', GAP, KICK + 10, doorZ0, W - GAP, H - TOP - 60, doorZ1],      // door
  ['panel',     GAP, H - TOP - 60, doorZ0, W - GAP, H - TOP - GAP, doorZ1 + 1], // control strip
  ['display',   W * 0.68, H - TOP - 45, doorZ1 + 1, W * 0.86, H - TOP - 18, doorZ1 + 2],
  ['handle',    W * 0.25, H - TOP - 95, doorZ1, W * 0.75, H - TOP - 80, D],
  ['kick',      10, 10, doorZ0 - 80, W - 10, KICK + 10, doorZ0 - 30],        // recessed plinth
  ['kick',      10, 10, 0, W - 10, KICK, doorZ0 - 80],                       // under-frame
  ...[[20, 20], [W - 60, 20], [20, doorZ0 - 120], [W - 60, doorZ0 - 120]].map(([x, z]) =>
    ['kick', x, 0, z, x + 40, 10, z + 40]),                                  // feet
]

// ── geometry ──
const FACES = [
  // normal, 4 corners as (x?, y?, z?) picks of [lo, hi] per axis
  [[ 1, 0, 0], [[1,0,1],[1,0,0],[1,1,0],[1,1,1]]],
  [[-1, 0, 0], [[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],
  [[ 0, 1, 0], [[0,1,1],[1,1,1],[1,1,0],[0,1,0]]],
  [[ 0,-1, 0], [[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],
  [[ 0, 0, 1], [[0,0,1],[1,0,1],[1,1,1],[0,1,1]]],
  [[ 0, 0,-1], [[1,0,0],[0,0,0],[0,1,0],[1,1,0]]],
]
const matNames = Object.keys(MATERIALS)
const byMat = new Map(matNames.map(m => [m, { pos: [], nrm: [], idx: [] }]))
for (const [m, x0, y0, z0, x1, y1, z1] of boxes) {
  const g = byMat.get(m)
  const lo = [x0, y0, z0], hi = [x1, y1, z1]
  for (const [n, corners] of FACES) {
    const base = g.pos.length / 3
    for (const c of corners) {
      g.pos.push(...c.map((h, a) => (h ? hi[a] : lo[a])))
      g.nrm.push(...n)
    }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
}

// ── GLB ──
const chunks = [], bufferViews = [], accessors = [], primitives = []
let offset = 0
function addView(typed, target) {
  const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)
  const pad = (4 - (bytes.length % 4)) % 4
  chunks.push(bytes, Buffer.alloc(pad))
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target })
  offset += bytes.length + pad
  return bufferViews.length - 1
}
for (const [mi, m] of matNames.entries()) {
  const g = byMat.get(m)
  if (!g.idx.length) continue
  const pos = new Float32Array(g.pos), nrm = new Float32Array(g.nrm), idx = new Uint16Array(g.idx)
  const min = [0, 1, 2].map(a => Math.min(...g.pos.filter((_, i) => i % 3 === a)))
  const max = [0, 1, 2].map(a => Math.max(...g.pos.filter((_, i) => i % 3 === a)))
  accessors.push({ bufferView: addView(pos, 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max })
  const pa = accessors.length - 1
  accessors.push({ bufferView: addView(nrm, 34962), componentType: 5126, count: nrm.length / 3, type: 'VEC3' })
  const na = accessors.length - 1
  accessors.push({ bufferView: addView(idx, 34963), componentType: 5123, count: idx.length, type: 'SCALAR' })
  primitives.push({ attributes: { POSITION: pa, NORMAL: na }, indices: accessors.length - 1, material: mi })
}
const gltf = {
  asset: { version: '2.0', generator: 'RHK build_dishwasher.mjs' },
  scene: 0, scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'Dishwasher' }],
  meshes: [{ name: 'Dishwasher', primitives }],
  materials: matNames.map(m => {
    const [r, g, b, metallic, roughness] = MATERIALS[m]
    return { name: m, pbrMetallicRoughness: { baseColorFactor: [r, g, b, 1], metallicFactor: metallic, roughnessFactor: roughness } }
  }),
  buffers: [{ byteLength: offset }],
  bufferViews, accessors,
}
let json = Buffer.from(JSON.stringify(gltf))
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)])
const bin = Buffer.concat(chunks)
const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8)
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b }
fs.writeFileSync(OUT, Buffer.concat([header, ch(json.length, 0x4e4f534a), json, ch(bin.length, 0x004e4942), bin]))
console.log(`wrote ${OUT} (${W}×${D}×${H} mm, ${boxes.length} boxes)`)
