// RHK6542 Danny's Robe rev5 (Mark 2026-11-03): TC-02 shoe drawer down to 2 off the bottom like TC-03 (box 16.5, front 18.5).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a', sleep = ms => new Promise(r => setTimeout(r, ms))
const { data: c } = await sb.from('cabinet_instances').select('id,internal_grid').eq('room_id', R).eq('label', 'TC-02').single()
const t = c.internal_grid.tree
t.fittings = t.fittings.map(f => f.type === 'inner_drawer' ? { ...f, y_locked: true, y_position: 16.5 } : f)
console.log((await sb.from('cabinet_instances').update({ internal_grid: { ...c.internal_grid, tree: t } }).eq('id', c.id)).error?.message ?? 'ok')
await sb.from('room_annotations').update({ geom: { at: { x: 60, y: -260 }, width: (902.5 - 60) / 20 } }).eq('room_id', R).like('text', 'SHOE PULL-OUT%')
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  await page.evaluate(() => window.__canvasApi.updateCabinet('TC-02', { dz: 580 })); await sleep(3000)
  for (const l of ['TC-02', 'TC-03']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    const f = rp.internal_parts.filter(p => p.part_type === 'inner_drawer_front')[0]
    console.log(l, 'bottom front', f.Y, '->', f.Y + f.DX, 'slide Y', rp.internal_slides[0].Y)
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0), 'issues', n)
} finally { await browser.close() }
