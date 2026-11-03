// RHK6478 Buffet rev 1 (Mark 2026-11-02): fronts under the 60 apron get a 60 top finger gap (40 apron drop + 20) so they don't
// foul it (Buffet BC-03 + Laundry BC-02 / BC-05); fridge divider panels BC-01 / BC-02 notched 22 x 40 at the top front for the
// apron (Shape Editor override, side frame x = depth from the back, y down from the top); open shelf dims + shelf heights AFF;
// mirror notes for the shop drawings (we supply the mirrors).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const BUF = '0df13af4-8a6f-438f-a10d-6a9b4754aa97', LAU = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc', SITE_LAYER = '2931a12f-666e-4f16-9840-8a8b4e09da50'
const APRON_GAP = 60
const cabsOf = async R => chk('cabs', await sb.from('cabinet_instances').select('id,label,face_grid').eq('room_id', R))
// 1. top fronts clear of the apron
const topGap = async (R, labels) => {
  for (const c of (await cabsOf(R)).filter(c => labels.includes(c.label))) {
    const fg = c.face_grid, top = Math.max(...fg.rows.map(r => r.row_index))
    fg.zones = fg.zones.map(z => z.row_index === top && z.face_type !== 'open' ? { ...z, finger_gap: APRON_GAP } : z)
    chk(c.label, await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id))
  }
}
await topGap(BUF, ['BC-03']); await topGap(LAU, ['BC-02', 'BC-05'])
// 2. notch the fridge divider panels at the top front (apron 20 thick + 2, 40 below the 880 carcass top)
const buf = await cabsOf(BUF), by = l => buf.find(c => c.label === l)
for (const l of ['BC-01', 'BC-02']) {
  const cp = chk('cp', await sb.from('cabinet_custom_parts').select('id,dx,dy').eq('cabinet_instance_id', by(l).id).single())
  const W = Number(cp.dx), H = Number(cp.dy), key = `custom_${cp.id}`
  const pts = [{ x: 0, y: 0 }, { x: W - 22, y: 0 }, { x: W - 22, y: 40 }, { x: W, y: 40 }, { x: W, y: H }, { x: 0, y: H }]
  const segments = pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % pts.length] }))
  const { data: prev } = await sb.from('part_shape_overrides').select('revision').eq('cabinet_id', by(l).id).eq('part_key', key).order('revision', { ascending: false }).limit(1)
  if (prev?.length) { console.log(l, 'already notched'); continue }
  chk('shape ' + l, await sb.from('part_shape_overrides').insert({ cabinet_id: by(l).id, part_key: key, revision: (prev?.[0]?.revision ?? 0) + 1, segments,
    meta: { closed: true, segmentCount: segments.length, bounds: { minX: 0, minY: 0, maxX: W, maxY: H }, sizeSlots: { across: 'dx', up: 'dy', custom: true }, baseAtSave: { w: W, h: H } } }))
  chk('note ' + l, await sb.from('cabinet_instances').update({ notes: `${l === 'BC-01' ? '18 2pac panel between the bar fridges' : '18 2pac panel, bar fridge 2 / drawers'}, to the floor, notched 22 x 40 at the top front for the bench apron` }).eq('id', by(l).id))
  console.log(l, 'notched', W, H)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async R => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  for (const [R, labels] of [[LAU, ['BC-02', 'BC-05']], [BUF, ['BC-03', 'BC-01', 'BC-02']]]) {
    await open(R)
    const st = await api('getState')
    for (const l of labels) {
      const c = st.cabinets.find(x => x.label === l)
      await api('updateCabinet', l, { dz: c.dz }); await sleep(1200)
      const rp = await api('getResolved', l)
      const z0 = R === LAU && l === 'BC-05' ? 690 : 140
      console.log(R === LAU ? 'Laundry' : 'Buffet', l, 'front tops AFF', JSON.stringify(rp.face_zones.map(z => +(z0 + z.Y + z.DY).toFixed(1))),
        'boxes', JSON.stringify((rp.drawer_stacks ?? []).map(s => [+(z0 + s.box_Y + (s.slides?.[0]?.box_height ?? 0)).toFixed(1), s.slides?.[0]?.box_height])),
        'custom', JSON.stringify(rp.custom_parts.map(p => [p.name, !!p.outline])))
    }
    const issues = await api('getIssues'); let n = 0
    for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
    console.log('issues', n)
  }
  // 3. open shelf unit: shelf positions from the resolve -> clear opening dims, shelf tops AFF, mirror notes
  const rp = await api('getResolved', 'WC-02')
  const BOT = 900, T = 33, X0 = 30, W = 1246
  const shelves = (rp.internal_parts ?? []).filter(p => /fixed_shelf/.test(p.part_key ?? p.part_type ?? '')).map(p => BOT + Number(p.Y)).sort((a, b) => a - b)
  console.log('shelf undersides AFF', shelves)
  const w2 = chk('wall', await sb.from('walls').select('id').eq('room_id', BUF).eq('name', 'Wall 2').single()).id
  const el = { room_id: BUF, view: 'elevation', wall_id: w2, wall_side: 'face' }
  const bounds = [BOT, ...shelves.flatMap(s => [s, s + T]), 2372 - T]   // opening bottom / top pairs
  const openings = []; for (let i = 0; i < bounds.length; i += 2) openings.push([bounds[i], bounds[i + 1]])
  const clearW = W - 2 * T
  const rows = []
  openings.forEach(([a, b], i) => {
    rows.push({ ...el, kind: 'dim', geom: { p1: { x: X0 + W - 120, y: -a }, p2: { x: X0 + W - 120, y: -b }, offset: 0, axis: 'y' }, style: {} })
    rows.push({ ...el, kind: 'text', geom: { at: { x: X0 + 230, y: -(a + b) / 2 + 25 }, width: 40 }, text: i === 0 ? `MIRROR ${clearW} x ${Math.round(b - a)}
All mirrors by RHK, cut to suit` : `MIRROR ${clearW} x ${Math.round(b - a)}`, style: { size: 2.5, align: 'center' } })
  })
  shelves.forEach(s => rows.push({ ...el, kind: 'text', geom: { at: { x: X0 + 45, y: -(s + T) - 70 } }, text: `${Math.round(s + T)} AFF`, style: { size: 2.5 } }))
  const { data: old } = await sb.from('room_annotations').select('id,text,kind,geom').eq('room_id', BUF).eq('view', 'elevation')
  for (const o of old ?? []) if ((o.kind === 'text' && /^MIRROR|AFF$/.test(o.text ?? '')) || (o.kind === 'dim' && Math.abs((o.geom?.p1?.x ?? 0) - (X0 + W - 120)) < 1)) await sb.from('room_annotations').delete().eq('id', o.id)
  chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: 50 + i }))))
  console.log('cad', rows.length, JSON.stringify(openings.map(([a, b]) => Math.round(b - a))))
} finally { await browser.close() }
