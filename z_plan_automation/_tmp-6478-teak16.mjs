// RHK6478: no 18mm Teak anywhere (Mark 2026-11-03) - LX Abs Grain 18 Sublime Teak -> LX Colour 16mm Sublime Teak (Chalk). Robes: end panels 16.5, carcasses widen.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const T18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11', T16 = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b'
const P = 'fa0884a2-abd1-4370-adfa-a30044e88ef2'
const rooms = chk('rooms', await sb.from('rooms').select('id,name').eq('project_id', P))
const touched = {}
for (const r of rooms) {
  const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,material_overrides,notes').eq('room_id', r.id))
  for (const c of cabs) {
    let hit = false
    const mo = c.material_overrides
    if (mo && JSON.stringify(mo).includes(T18)) {
      const n = JSON.parse(JSON.stringify(mo).replaceAll(T18, T16))
      chk('mo', await sb.from('cabinet_instances').update({ material_overrides: n, notes: c.notes?.replace(/\(Abs Grain 18\)/g, '(16mm Chalk)').replace(/^# (\d) 18 x 200/, '# $1 16.5 x 200') }).eq('id', c.id)); hit = true
    }
    const cp = chk('cp', await sb.from('cabinet_custom_parts').update({ material_id: T16 }).eq('cabinet_instance_id', c.id).eq('material_id', T18).select('id'))
    if (cp.length) hit = true
    if (hit) (touched[r.id] ??= { name: r.name, labels: [] }).labels.push(c.label)
  }
}
console.log(JSON.stringify(Object.values(touched)))
const RESIZE = {
  'Bed 2 Robe': [['TC-01', { dx: 16.5 }], ['TC-02', { offset: 16.5, dx: 892 }], ['TC-03', { offset: 908.5, dx: 892 }], ['TC-04', { offset: 1800.5, dx: 892 }], ['TC-05', { offset: 2692.5, dx: 16.5 }]],
  'Bed 3 Robe': [['TC-01', { dx: 16.5 }], ['TC-02', { offset: 16.5, dx: 1072.5 }], ['TC-03', { offset: 1089, dx: 1072.5 }], ['TC-04', { offset: 2161.5, dx: 16.5 }]],
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  const open = async id => { await page.goto(`http://localhost:3001/canvas/${id}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  for (const [rid, t] of Object.entries(touched)) {
    await open(rid)
    const st = await api('getState')
    const cabs = st.cabinets ?? st.cabinetInstances ?? []
    if (RESIZE[t.name]) {
      for (const [l, p] of RESIZE[t.name]) { await api('updateCabinet', l, p); await sleep(1500) }
      const ids = chk('ids', await sb.from('cabinet_instances').select('id,label').eq('room_id', rid).in('label', [RESIZE[t.name][0][0], RESIZE[t.name].at(-1)[0]]))
      chk('pos', await sb.from('cabinet_instances').update({ pos_y: 400 }).in('id', ids.map(i => i.id)))
      await open(rid)
    }
    const all = chk('all', await sb.from('cabinet_instances').select('label,dz').eq('room_id', rid))
    for (const l of t.labels) { const c = all.find(x => x.label === l); await api('updateCabinet', l, { dz: Number(c.dz) }); await sleep(1500) }
    const issues = await api('getIssues'); let n = 0
    for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${t.name} ${ci.label} ${e.code}: ${e.message}`) }
    console.log(t.name, 'issues', n)
    for (const c of chk('after', await sb.from('cabinet_instances').select('label,pos_x,pos_y,pos_z,dx,dy,dz').eq('room_id', rid).in('label', RESIZE[t.name]?.map(x => x[0]) ?? []).order('label'))) console.log('   ', JSON.stringify(c))
  }
} finally { await browser.close() }
