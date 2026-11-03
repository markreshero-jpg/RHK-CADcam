// RHK6542 Danny's Robe rev4 (Mark 2026-11-03): AV shelf really set back 20 behind the inset flap —
// rebuilt as a fixed_shelf FITTING with setback_front 20 (resolved geometry), size override removed.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a', sleep = ms => new Promise(r => setTimeout(r, ms))
const c = chk('cab', await sb.from('cabinet_instances').select('id,internal_grid,part_pos_overrides').eq('room_id', R).eq('label', 'TC-03').single())
const kids = c.internal_grid.tree.children
console.log('before', JSON.stringify(kids.map(k => [k.size, k.separator, k.section.fittings?.map(f => f.type)])))
if (process.env.SKIP !== '1' && kids.length === 3) {
  const drawers = kids[0].section.fittings.filter(f => f.type === 'inner_drawer')
  const tree = { type: 'hsplit', children: [
    { size: 665, separator: 'fixed_shelf', section: { type: 'open', fittings: [...drawers,
      { type: 'fixed_shelf', y_locked: true, y_position: 460.5, setback_front: 20 }] } },
    kids[2] ] }
  const { int_fixed_shelf_0, ...ov } = c.part_pos_overrides ?? {}
  chk('upd', await sb.from('cabinet_instances').update({ internal_grid: { ...c.internal_grid, tree }, part_pos_overrides: ov }).eq('id', c.id))
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  await page.evaluate(() => window.__canvasApi.updateCabinet('TC-03', { dz: 580 })); await sleep(3000)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('TC-03'))
  console.log('shelves', JSON.stringify(rp.internal_parts.filter(p => p.part_type === 'fixed_shelf').map(p => [p.sort_order, 'Y', p.Y, 'Z', p.Z, 'depth', p.DX, 'front', p.Z + p.DX])))
  console.log('flap', JSON.stringify(rp.face_zones.map(z => [z.Y, z.Y + z.DY, 'back', z.Z, 'front', z.Z + z.DZ])))
  for (const h of rp.hinge_instances) console.log('hinge', h.sort_order, JSON.stringify(h.mount_target), JSON.stringify(h.plate_drills.map(d => [d.x, d.y, d.z])))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0), 'issues', n)
} finally { await browser.close() }
