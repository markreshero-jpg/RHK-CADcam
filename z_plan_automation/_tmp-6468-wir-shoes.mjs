// RHK6468 WIR shoe shelves (Mark's sketch on "Mark Ups for Ai", 2026-11-15):
// each level = a normal FIXED SHELF tilted 15 deg (front low, back high, full depth from the cab back) + a 50 high
// front rail (a 50-deep fixed shelf turned up 90 deg at the front). Bottom level sits on the cab bottom; upper levels
// are the sloped shelf + rail only. Tilts are the native per-part rotate override (part_pos_overrides, oax),
// pivoting on the part's back-bottom corner like the 3D view and the joint drilling.
// Run twice is safe: pass 1 writes the fittings + re-resolves, pass 2 maps the resolved parts and writes overrides.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const TILT = 15, RAIL = 50, LEVELS = 8, PITCH = 235, BOT = 16.5
const S = Math.sin(TILT * Math.PI / 180)

const ints = async id => chk('ip', await sb.from('internal_parts').select('*').eq('cabinet_instance_id', id))
const plan = []
for (const label of ['TC-02', 'TC-11']) {
  const c = chk(label, await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', label).single())
  // Full internal depth = the 2120 fixed shelf (the hsplit separator), which runs the full depth.
  const full = (await ints(c.id)).filter(p => p.part_type === 'fixed_shelf').sort((a, b) => b.dx - a.dx)[0]
  const D = full.dx
  const fittings = []
  for (let k = 0; k < LEVELS; k++) {
    const F = BOT + k * PITCH                       // front-bottom of the sloped shelf = rail bottom
    fittings.push({ type: 'fixed_shelf', y_locked: true, y_position: F, setback_back: D - RAIL })      // rail (turned up)
    fittings.push({ type: 'fixed_shelf', y_locked: true, y_position: +(F + D * S).toFixed(1) })        // sloped shelf
  }
  const g = structuredClone(c.internal_grid)
  g.tree.children[0].section.fittings = fittings
  chk('grid', await sb.from('cabinet_instances').update({ internal_grid: g, notes: 'SHOES: open, 8 levels of 15 deg sloped fixed shelves (front low) with 50 front rails, top shelf 2120' }).eq('id', c.id))
  plan.push({ label, id: c.id, D, fittings })
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  for (const p of plan) { console.log(p.label, JSON.stringify(await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dy: 2543 }), p.label))); await sleep(2500) }

  // Map resolved parts -> overrides
  for (const p of plan) {
    const parts = (await ints(p.id)).filter(q => q.part_type === 'fixed_shelf')
    const c = chk('c', await sb.from('cabinet_instances').select('part_pos_overrides').eq('id', p.id).single())
    const ov = { ...(c.part_pos_overrides ?? {}) }
    for (const k of Object.keys(ov)) if (k.startsWith('int_fixed_shelf_')) delete ov[k]
    let n = 0
    for (const q of parts) {
      const rail = Math.abs(q.dx - RAIL) < 1
      const sloped = Math.abs(q.dx - p.D) < 1 && p.fittings.some(f => !f.setback_back && Math.abs(f.y_position - q.y) < 1)
      if (rail) ov[`int_fixed_shelf_${q.sort_order}`] = { ox: 0, oy: 0, oz: RAIL, oax: -90, oay: 0, oaz: 0 }
      else if (sloped) ov[`int_fixed_shelf_${q.sort_order}`] = { ox: 0, oy: 0, oz: 0, oax: TILT, oay: 0, oaz: 0 }
      else continue
      n++
    }
    chk('ov', await sb.from('cabinet_instances').update({ part_pos_overrides: ov }).eq('id', p.id))
    console.log(p.label, 'D', p.D, 'fixed shelves', parts.length, 'overrides', n)
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log(`  ${ci.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
