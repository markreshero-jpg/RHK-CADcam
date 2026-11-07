// Catalogue: Furnware K-Push Tech Long, concealed, with buffer, white (DPC5B.WH.FG) as a push-to-open item (grip 'push',
// HANDLES-SPEC D12: costed catalogue item, hand-drilled, no CNC). RHK6595 BC-01/02/03 doors switched to it (Mark 2026-11-07).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', NAME = 'K-Push Tech Long Concealed (buffer)'
let h = (await sb.from('hardware_handles').select('id').eq('name', NAME)).data[0]
if (!h) {
  const r = await sb.from('hardware_handles').insert({
    name: NAME, brand: 'Furnware', finish: 'White', handle_type: 'other', grip_kind: 'push', needs_finger_gap: false, holes: [], active: true,
    notes: 'SKU DPC5B.WH.FG. Push-to-open, concealed, with buffer, single unit, long version. Throw 37, 6 adjustment. Screw-on + adhesive striker plates included. Also in Anthracite / with magnet / short. Price: trade login (TBC). https://furnwaregroup.com.au/product/k-push-tech-long-concealed/?sku=DPC5B.WH.FG',
  }).select('id').single()
  if (r.error) { console.error(r.error.message); process.exit(1) }
  h = r.data
}
console.log('handle', h.id)
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,face_grid').eq('room_id', ROOM).in('label', ['BC-01', 'BC-02', 'BC-03'])
for (const c of cabs) {
  const fg = c.face_grid
  for (const z of fg.zones ?? []) if (z.face_type === 'door') z.handle_id = h.id
  console.log(c.label, (await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id)).error?.message ?? 'ok')
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(6000)
  for (const l of ['BC-01', 'BC-02', 'BC-03']) {
    const dy = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(c => c.label === l).dy
    await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [l, dy]); await sleep(3000)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, JSON.stringify(rp.face_zones.map(z => [z.handle?.name ?? null, z.material_id?.slice(0, 8)])), 'warn', JSON.stringify(rp.warnings.map(w => w.message)))
  }
} finally { await browser.close() }
