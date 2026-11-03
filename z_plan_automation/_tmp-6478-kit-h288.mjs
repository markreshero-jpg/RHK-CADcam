// RHK6478 Kitchen: Momo Barra 288 DBR on the fridge / freezer doors TC-04 / TC-05 (Mark 2026-11-04):
// vertical, handle centre 1000 AFF, hole line 50 in from the non-hinged edge. Adds the handle to the library.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6', CENTRE_AFF = 1000
let h = chk('h', await sb.from('hardware_handles').select('id').eq('name', 'Momo Barra 288 DBR'))[0]
if (!h) h = chk('hins', await sb.from('hardware_handles').insert({ name: 'Momo Barra 288 DBR', brand: 'Momo', handle_type: 'bar', length: 300, bore_centres: 288,
  active: true, finish: 'DBR', grip_kind: 'hardware', needs_finger_gap: false, holes: [],
  notes: 'RHK6478 fridge / freezer doors. 288 centres, finish DBR. Overall length TBC (300 assumed).' }).select('id'))[0]
console.log('handle', h.id)
const cabs = chk('c', await sb.from('cabinet_instances').select('id,label,face_grid,pos_z').eq('room_id', R).in('label', ['TC-04', 'TC-05']))
const setZones = async (offset) => { for (const c of cabs) {
  const fg = structuredClone(c.face_grid)
  fg.zones = fg.zones.map(z => ({ ...z, handle_id: h.id, grip_edge: 'bottom', handle_inset: 50, handle_offset: offset }))
  chk(c.label, await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id))
} }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]); await sleep(2000); return r }
  const probe = async () => { const out = {}; for (const c of cabs) {
    await api('updateCabinet', c.label, { dz: 630 })
    const r = await api('getResolved', c.label)
    const z = r.face_zones[0], hd = z.handle ?? (r.handles ?? [])[0]
    out[c.label] = { zoneY: z.Y, zoneDY: z.DY, zoneDX: z.DX, hinge: z.hinge_side, handle: hd ? { x: hd.x, y: hd.y, name: hd.name, holes: hd.holes } : null, keys: Object.keys(z).join(',') }
  } return out }
  await setZones(50); await open()
  const p1 = await probe(); console.log(JSON.stringify(p1))
  // centre AFF = pos_z + zone.Y + handle.y; offset 50 gives centre at 50 + 144 above the door bottom
  const c0 = cabs[0], z0 = p1[c0.label]
  if (!z0.handle) throw new Error('no handle resolved')
  const doorBottomAFF = c0.pos_z + z0.zoneY
  await setZones(Math.round((CENTRE_AFF - 144 - doorBottomAFF) * 10) / 10); await open()
  const p2 = await probe()
  for (const c of cabs) console.log(c.label, 'centre AFF', c.pos_z + p2[c.label].zoneY + p2[c.label].handle.y, 'x', p2[c.label].handle.x, 'of', p2[c.label].zoneDX, p2[c.label].hinge, JSON.stringify(p2[c.label].handle.holes))
  console.log('issues', JSON.stringify((await api('getIssues')).filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
