// Grain match G2 (z_grain_match): seed GM1 ↔ (BC-01) + GM2 ↕ (WC-01, WC-02) in the
// Test Kitchen, turn on Layers ▸ Show grain match, screenshot plan + elevation,
// then remove the test groups again. KEEP=1 leaves them in place.
import path from 'node:path'
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'f8e33374-a1fe-4fce-b272-4d4380200367'   // Test Kitchen
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('saved', name) }

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: cabs } = await sb.from('cabinet_instances').select('id, label').eq('room_id', ROOM)
const id = l => cabs.find(c => c.label === l).id
const { data: g1 } = await sb.from('grain_match_groups').insert({ room_id: ROOM, name: 'GM1', direction: 'horizontal' }).select().single()
const { data: g2 } = await sb.from('grain_match_groups').insert({ room_id: ROOM, name: 'GM2', direction: 'vertical' }).select().single()
await sb.from('cabinet_instances').update({ grain_match_group_id: g1.id }).in('id', [id('BC-01')])
await sb.from('cabinet_instances').update({ grain_match_group_id: g2.id }).in('id', [id('WC-01'), id('WC-02')])

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
const clickText = (page, re, sel = 'button, div, span') => page.evaluate((src, sel) => {
  const re = new RegExp(src)
  const el = [...document.querySelectorAll(sel)].filter(b => b.offsetParent && re.test(b.textContent.trim()) && b.children.length <= 2).pop()
  el?.click(); return !!el
}, re.source, sel)
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(4000)
  console.log('plan tab', await clickText(page, /^Plan$/, 'button')); await sleep(1500)
  console.log('Layers menu', await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim() === 'Layers'); b?.click(); return !!b })); await sleep(500)
  console.log('toggle', await clickText(page, /Show grain match/)); await sleep(1500)
  await shot(page, 'gm2-plan.png')
  console.log('elev tab', await clickText(page, /^Elevation$/, 'button')); await sleep(3000)
  await shot(page, 'gm2-elev.png')
} finally {
  await browser.close()
  if (!process.env.KEEP) {
    await sb.from('cabinet_instances').update({ grain_match_group_id: null }).eq('room_id', ROOM)
    await sb.from('grain_match_groups').delete().eq('room_id', ROOM)
    console.log('test groups removed')
  }
}
