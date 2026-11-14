// Builds a GLB for the Zip HydroTap (H5L783Z03AU, matte black) from Zip's 2D DWG
// (`models/Models for import…/Zip-Hydrotap.dwg`: plan / front / side views, lines only —
// no 3D solid in it). Read with LibreDWG (npm @mlightcad/libredwg-web), sizes taken off
// the side + plan views:
//   column Ø46, 204 high at the back, top sloped down to 170 at the front (touch pad,
//   6 button strips), spout 34 wide × 22 deep (134–156 up), runs forward to a curved
//   nose — tip 123 in front of the column centre, outlet underside 115 above the top.
//   node z_fixtures/make-zip-hydrotap-glb.mjs public/fixture-models/Zip_HydroTap_H5L783Z03AU_MatteBlack.glb
// Metres, Y up, +Z = spout direction (front). Origin = tap-hole centre (column centre) on
// the benchtop, as the Abey / Phoenix tap models.
import fs from 'node:fs'
import * as THREE from 'three'

const OUT = process.argv[2]
const BLACK = [0.035, 0.035, 0.037, 1]
const R = 0.023, TOP_BACK = 0.204, TOP_FRONT = 0.170
const topAt = z => (TOP_BACK + TOP_FRONT) / 2 - (z / R) * (TOP_BACK - TOP_FRONT) / 2

// ── Column with the sloped top ──
const col = new THREE.CylinderGeometry(R, R, TOP_BACK, 72, 1)
col.translate(0, TOP_BACK / 2, 0)
{
  const p = col.attributes.position
  for (let i = 0; i < p.count; i++) if (p.getY(i) > TOP_BACK - 1e-6) p.setY(i, topAt(p.getZ(i)))
  col.computeVertexNormals()
}

// ── Spout: side profile (Z forward, Y up) extruded across X with a bevel ──
// DWG side view → here: z = 50 − x_side, y = y_side + 102 (mm).
const pts = [
  [10, 134.5], [90, 134.5], [92, 132], [96, 126], [100, 121], [101, 117],   // underside → inner curve
  [113, 115], [119, 115.5], [123, 124],                                     // outlet face → tip
  [121, 137], [115, 147], [105, 153], [92, 156], [10, 156],                 // outer curve → top
].map(([z, y]) => new THREE.Vector2(z / 1000, y / 1000))
const BEV = 0.006, HALF = 0.017, BEV_SIZE = BEV * 0.8
// The bevel grows the outline by BEV_SIZE, so inset the profile first (mitred offset)
// to keep the finished spout on the DWG lines.
const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p.x * q.y - q.x * p.y }, 0)
const inset = pts.map((p, i) => {
  const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]
  const n1 = new THREE.Vector2(p.y - a.y, a.x - p.x).normalize(), n2 = new THREE.Vector2(b.y - p.y, p.x - b.x).normalize()
  const m = n1.clone().add(n2).normalize(), k = BEV_SIZE / Math.max(0.5, m.dot(n1))
  return p.clone().addScaledVector(m, area > 0 ? -k : k)   // CCW: (dy, −dx) points outward → step in
})
const spout = new THREE.ExtrudeGeometry(new THREE.Shape(inset), {
  depth: 2 * (HALF - BEV), bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV_SIZE, bevelSegments: 4, curveSegments: 8,
})
// shape (x, y, z) → world (z − half, y, x): a reflection, so flip the winding back.
function remap(g) {
  g = g.index ? g.toNonIndexed() : g
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    p.setXYZ(i, z - (HALF - BEV), y, x)
  }
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i + 1), ay = p.getY(i + 1), az = p.getZ(i + 1)
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, ax, ay, az)
  }
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g.computeVertexNormals()
  return g
}
const spoutG = remap(spout)

// ── Outlet + touch-pad strips (slightly proud, a touch lighter so they read) ──
const outlet = new THREE.CylinderGeometry(0.007, 0.007, 0.0015, 32)
outlet.translate(0, 0.1148, 0.116)
const slope = Math.atan2(TOP_BACK - TOP_FRONT, 2 * R)
const strips = []
for (const [z, len] of [[0.012, 0.013], [0.003, 0.0105], [-0.006, 0.006]]) for (const side of [-1, 1]) {
  const b = new THREE.BoxGeometry(len, 0.0008, 0.0022)
  b.rotateX(slope)
  b.translate(side * (0.0025 + len / 2), topAt(z) + 0.0004, z)
  strips.push(b)
}
const merge = gs => {
  const pos = []
  for (const g of gs) { const n = g.index ? g.toNonIndexed() : g; pos.push(...n.attributes.position.array) }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.computeVertexNormals()
  return m
}

const meshes = [
  { name: 'Column', g: col, color: BLACK, metallic: 0.2, rough: 0.55 },
  { name: 'Spout', g: spoutG, color: BLACK, metallic: 0.2, rough: 0.55 },
  { name: 'Outlet', g: outlet, color: [0.12, 0.12, 0.12, 1], metallic: 0.2, rough: 0.7 },
  { name: 'TouchPad', g: merge(strips), color: [0.22, 0.22, 0.23, 1], metallic: 0.1, rough: 0.4 },
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
  const P = new Float32Array(m.g.attributes.position.array), N = new Float32Array(m.g.attributes.normal.array)
  const I = new Uint32Array(m.g.index ? m.g.index.array : [...Array(P.length / 3).keys()])
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
const json = { asset: { version: '2.0', generator: 'RHK-CADcam make-zip-hydrotap-glb' }, scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i), extras: { maker: 'Zip', model: 'HydroTap H5L783Z03AU matte black',
    origin: 'tap-hole centre on the benchtop, +Z = spout', source: 'Zip-Hydrotap.dwg 2D views' } }],
  nodes, meshes: gltfMeshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: bin.length }] }
let js = Buffer.from(JSON.stringify(json))
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)])
const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8)
jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4)
bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4)
fs.writeFileSync(OUT, Buffer.concat([header, jh, js, bh, bin]))
console.log('wrote', OUT, 12 + 8 + js.length + 8 + bin.length, 'bytes')
