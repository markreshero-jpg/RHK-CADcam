// RHK6478 Study: splash WC-03 one piece, full wall 2656 (nib face to window wall); WC-04 deleted (Mark 2026-11-04).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const w4 = chk('w4', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'WC-04'))
if (w4.length) {
  for (const t of ['cabinet_custom_parts']) chk(t, await sb.from(t).delete().eq('cabinet_instance_id', w4[0].id))
  chk('ops', await sb.from('part_operations').delete().eq('source_cabinet_id', w4[0].id))
  chk('del', await sb.from('cabinet_instances').delete().eq('id', w4[0].id))
  console.log('WC-04 deleted')
}
chk('notes', await sb.from('cabinet_instances').update({ notes: 'Splash wall panel 2pac colour TBC, 900-1483 - one piece, full wall 2656 (nib to window wall)' }).eq('room_id', R).eq('label', 'WC-03'))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
try {
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('WC-03', { dx: 2656 })))); await sleep(2000)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.filter(c => /WC-0[1-5]/.test(c.label))) console.log(c.label, c.wall, c.offset, c.dx, c.dy, c.dz, c.pos_z)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('WC-03'))
  console.log(JSON.stringify((rp.custom_parts ?? []).map(p => [p.name, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)])))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
