// Weber Baby Q Premium Q1200N (Charcoal Grey) — no supplier 3D model, so this re-colours the
// Weber Q QX2800N+ GLB (same Q shape: lid, cradle, two side tables). The catalogue row sizes it to
// the Baby Q box (1050 x 440 x 380, side tables out, lid closed — Weber spec sheet v2).
//   node z_fixtures/make-weber-babyq-glb.mjs
import fs from 'node:fs'
const SRC = 'public/fixture-models/Weber_QX2800N_plus.glb'
const OUTS = ['public/fixture-models/Weber_BabyQ_Q1200N_CharcoalGrey.glb', 'z_fixtures/models/BBQ/Weber_BabyQ_Q1200N_CharcoalGrey.glb']
const b = fs.readFileSync(SRC)
const jl = b.readUInt32LE(12)
const json = JSON.parse(b.subarray(20, 20 + jl).toString())
const rest = b.subarray(20 + jl)                       // BIN chunk, unchanged
const lin = h => [1, 3, 5].map(i => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
// Lid + cookbox: Midnight Black -> Charcoal Grey. Cradle, side tables, knobs stay dark.
const RECOLOUR = { '#141414': '#4B4E52' }
for (const m of json.materials) {
  const to = RECOLOUR[m.name]; if (!to) continue
  m.pbrMetallicRoughness.baseColorFactor = [...lin(to).map(v => Math.round(v * 1e5) / 1e5), 1]
  m.name = to
}
json.scenes[0].extras = { maker: 'Weber', model: 'Baby Q Premium Q1200N LPG', colour: 'Charcoal Grey', note: 'QX2800N+ geometry, sized by the catalogue row' }
json.asset = { ...json.asset, generator: 'RHK-CADcam make-weber-babyq-glb' }
let js = Buffer.from(JSON.stringify(json))
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)])
const head = Buffer.alloc(20)
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + js.length + rest.length, 8)
head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4e4f534a, 16)
const glb = Buffer.concat([head, js, rest])
for (const o of OUTS) { fs.writeFileSync(o, glb); console.log('wrote', o, glb.length, 'bytes') }

// Same model with the two side tables left off (RHK6593 2026-11-25: Baby Q set down in a stone well,
// tables removed). The table nodes just drop out of the scene; the BIN chunk is unchanged.
const root = json.nodes[json.scenes[0].nodes[0]]
root.children = root.children.filter(i => !/^side_table/.test(json.nodes[i].name ?? ''))
json.scenes[0].extras.note = 'QX2800N+ geometry, side tables off, sized by the fixture row'
let js2 = Buffer.from(JSON.stringify(json))
js2 = Buffer.concat([js2, Buffer.alloc((4 - (js2.length % 4)) % 4, 0x20)])
const head2 = Buffer.from(head)
head2.writeUInt32LE(20 + js2.length + rest.length, 8); head2.writeUInt32LE(js2.length, 12)
const glb2 = Buffer.concat([head2, js2, rest])
for (const o of OUTS.map(o => o.replace('.glb', '_NoTables.glb'))) { fs.writeFileSync(o, glb2); console.log('wrote', o, glb2.length, 'bytes') }
