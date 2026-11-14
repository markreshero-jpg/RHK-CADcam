// RHK6468 Kitchen post-draw: sink hinges under the upright rail, re-resolve, issues, shots.
// node _tmp-6468-kit-post.mjs <outPrefix> [fix]
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const OUT = process.argv[2]
const FIX = process.argv[3] === 'fix'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const touched = []
if (FIX) {
  // Sinks (rails on edge): top hinge under the 80 upright rail.
  const { data: sinks } = await sb.from('cabinet_instances').select('id,label,face_grid').eq('room_id', R).in('label', ['BC-07', 'BC-36'])
  for (const s of sinks) {
    const fg = s.face_grid; fg.zones = fg.zones.map(z => ({ ...z, hinges: [100, 660] }))
    const { error } = await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', s.id); if (error) throw error
    touched.push(s.label)
  }
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1800, height: 1100 }, protocolTimeout: 900000 })
const click = (page, t) => page.evaluate(t => { const b = [...document.querySelectorAll('button')].filter(e => e.textContent.trim() === t && e.offsetParent); b[0]?.click(); return b.length }, t)
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 }); await sleep(4000)
  if (FIX) {
    const { data: rows } = await sb.from('cabinet_instances').select('label,dy').eq('room_id', R).in('label', touched)
    for (const r of rows) { console.log(r.label, JSON.stringify(await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [r.label, Number(r.dy)]))); await sleep(1500) }
    const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
    for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
    console.log('issues', n)
    await page.reload({ waitUntil: 'networkidle2' }); await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 }); await sleep(4000)
  }
  await click(page, 'Plan'); await sleep(4000); await page.screenshot({ path: OUT + 'plan.png' })
  await click(page, 'Elevation'); await sleep(4000)
  for (const w of (process.argv[4] ?? 'Wall 2,Wall 3,Wall 4,Wall 7,Wall 8,Wall 9').split(',')) {
    await page.evaluate(t => { const b = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === t && e.offsetParent); b[0]?.click() }, w)
    await sleep(4000); await page.screenshot({ path: OUT + w.replace(' ', '') + '.png' })
  }
  await click(page, '3D'); await sleep(9000); await page.screenshot({ path: OUT + '3d.png' })
} finally { await browser.close() }
