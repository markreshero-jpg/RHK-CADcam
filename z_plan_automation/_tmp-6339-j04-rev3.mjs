// RHK6339 J04 rev 3 (Mark 2026-11-12): do WC-03's open left end NATIVELY - Edit shape footprint
// (rectangle preset) with the left edge set to Open, instead of rev 2's Removed left side +
// ox/sw part overrides. Keeps rev 1's 700-deep top + right side (sd overrides).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b2252689-fdc9-4fd7-be9a-f29853f0391e'
const mode = process.argv[2] ?? 'apply'
const { data: c } = await sb.from('cabinet_instances').select('id,dx,dz,footprint,part_pos_overrides,part_hide_views').eq('room_id', R).eq('label', 'WC-03').single()
console.log('before', JSON.stringify({ fp: !!c.footprint, pov: c.part_pos_overrides, hide: c.part_hide_views }))

if (mode === 'apply') {
  const W = c.dx, D = c.dz
  // Same as buildPresetFootprint('rectangle', {}, {w,d}, { left: { role: 'open' } }).
  const V = [['back', '0', '0', 'back', 0, 0], ['right', 'cab.w', '0', 'side', W, 0], ['front', 'cab.w', 'cab.d', 'front', W, D], ['left', '0', 'cab.d', 'side', 0, D]]
  const segments = V.map(([id, x, y, role, px, py], i) => {
    const n = V[(i + 1) % V.length]
    return { type: 'line', p0: { x: px, y: py }, p1: { x: n[4], y: n[5] }, p0_expr: { x, y }, edge: { id, role: id === 'left' ? 'open' : role } }
  })
  const footprint = { preset: 'rectangle', params: {}, from_preset: 'rectangle', segments, edge_overrides: { left: { role: 'open' } } }
  // Undo rev 2: left side back on (the open edge makes no panel), drop the ox/sw stretches.
  const pov = { ...(c.part_pos_overrides ?? {}) }
  delete pov.case_bottom; delete pov.case_back
  if (pov.case_full_top) { const { ox, sw, ...rest } = pov.case_full_top; pov.case_full_top = { ...rest, ox: 0 } }
  const hide = { ...(c.part_hide_views ?? {}) }; delete hide.case_left_side
  const r = await sb.from('cabinet_instances').update({ footprint, part_pos_overrides: pov, part_hide_views: hide }).eq('id', c.id)
  console.log('update', r.error?.message ?? 'ok', JSON.stringify(pov))

  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
  try {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('dialog', d => d.dismiss())
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
    console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('WC-03', { dz: 510 })))); await sleep(4000)
    for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', ci.label, e.code, e.message)
  } finally { await browser.close() }
}

const { data: parts } = await sb.from('case_parts').select('*').eq('cabinet_instance_id', c.id)
for (const p of parts ?? []) console.log('part', p.part_key, p.dx, p.dy, p.dz, 'x', p.x ?? p.pos_x, 'y', p.y ?? p.pos_y, 'z', p.z ?? p.pos_z)
