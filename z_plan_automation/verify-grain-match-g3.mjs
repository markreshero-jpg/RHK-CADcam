// Grain match G3 (z_grain_match): BC-01 in a horizontal group → its grained doors show
// horizontal ghost grain in elevation. Picks the first layer set whose name isn't
// "Line drawing" (SET=<name> to choose), zooms on BC-01, screenshots, cleans up.
import path from 'node:path'
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'f8e33374-a1fe-4fce-b272-4d4380200367'   // Test Kitchen
const sleep = ms => new Promise(r => setTimeout(r, ms))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: g } = await sb.from('grain_match_groups').insert({ room_id: ROOM, name: 'GM1', direction: 'horizontal' }).select().single()
await sb.from('cabinet_instances').update({ grain_match_group_id: g.id }).eq('room_id', ROOM).eq('label', 'BC-01')

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(4000)
  const prev = await page.evaluate(want => {
    const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => /line drawing/i.test(o.text)))
    if (!sel) return null
    const opts = [...sel.options].map(o => o.text)
    const pick = [...sel.options].find(o => want ? o.text === want : !/line drawing/i.test(o.text) && o.value)
    const was = sel.value
    if (pick) { const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, pick.value); sel.dispatchEvent(new Event('change', { bubbles: true })) }
    return { opts, picked: pick?.text, was }
  }, process.env.SET ?? null)
  console.log('layer sets', JSON.stringify(prev))
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim() === 'Elevation')?.click())
  await sleep(3000)
  await page.screenshot({ path: path.join(OUT, 'gm3-elev.png') }); console.log('saved gm3-elev.png')
  // Put the user's layer set choice back (it's a saved per-user pref).
  if (prev?.was) await page.evaluate(v => {
    const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => /line drawing/i.test(o.text)))
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, v); sel.dispatchEvent(new Event('change', { bubbles: true }))
  }, prev.was)
  await sleep(500)
} finally {
  await browser.close()
  await sb.from('cabinet_instances').update({ grain_match_group_id: null }).eq('room_id', ROOM)
  await sb.from('grain_match_groups').delete().eq('room_id', ROOM)
  console.log('test group removed')
}
