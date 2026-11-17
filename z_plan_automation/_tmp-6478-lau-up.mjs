// RHK6478 Laundry (Mark 2026-11-17): overheads WC-02 / WC-03 - no handle (no finger pull), under panel
// 16.5 Sublime Teak under both, set back 20 from the back of the doors (carcass 330 -> panel 310),
// bottom scribe SCRBT = the under panel thickness. Overall height stays 1055 (panel inside the scribed sides).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc', TEAK = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabsNow = async () => (await sb.from('cabinet_instances').select('id,label,dx,dy,dz,pos_z,rule_overrides,face_grid,material_overrides').eq('room_id', ROOM)).data
const by = async l => (await cabsNow()).find(c => c.label === l)
const upd = async (l, u) => { const c = await by(l); const { error } = await sb.from('cabinet_instances').update(u).eq('id', c.id); console.log(l, error?.message ?? 'ok', JSON.stringify(u).slice(0, 160)) }

// 1. No handle on the overhead doors.
for (const l of ['WC-02', 'WC-03']) {
  const c = await by(l); const fg = structuredClone(c.face_grid); fg.zones = fg.zones.map(z => ({ ...z, handle_id: 'none' }))
  await upd(l, { face_grid: fg })
}

// 2. Under panel through the canvas (Right-click > Add under panel), then 310 deep + Teak.
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate(([fn, a]) => window.__canvasApi[fn](...a), [fn, a])
  const before = new Set((await cabsNow()).map(c => c.label))
  if ((await cabsNow()).some(c => c.rule_overrides?.UNDER_PANEL && c.pos_z > 1500 && c.dx > 1400)) throw new Error('under panel already there')
  console.log('under', JSON.stringify(await api('addUnderPanel', ['WC-02', 'WC-03'])))
  await sleep(4000)
  const wup = (await cabsNow()).find(c => !before.has(c.label))
  if (!wup) throw new Error('no new under panel')
  await upd(wup.label, { material_overrides: { ...(wup.material_overrides ?? {}), exposed: TEAK },
    notes: 'Under panel 16.5 Sublime Teak under WC-02 / WC-03, set back 20 from the back of the doors (no handles)' })
  console.log('wup', wup.label, JSON.stringify(await api('updateCabinet', wup.label, { dy: 16.5, dz: 310 })))
  await sleep(2000)
  // Scribe = panel thickness (addUnderPanel can leave 18).
  for (const l of ['WC-02', 'WC-03']) {
    const c = await by(l)
    if (Number(c.rule_overrides?.SCRBT) !== 16.5) await upd(l, { rule_overrides: { ...(c.rule_overrides ?? {}), SCRBT: 16.5 } })
  }
  for (const l of ['WC-02', 'WC-03', wup.label]) { await api('updateCabinet', l, { dz: (await by(l)).dz }); await sleep(1500) }
  for (const l of ['WC-02', 'WC-03', wup.label]) { const c = await by(l); console.log(l, c.dx, c.dy, c.dz, 'z', c.pos_z, JSON.stringify(c.rule_overrides)) }
  const issues = await api('getIssues')
  for (const c of issues) for (const e of [...c.errors, ...c.warnings]) console.log(`  ${c.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
process.exit(0)
