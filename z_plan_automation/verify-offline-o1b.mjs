// Offline step 1b (z_offline/OFFLINE-SPEC.md): clash flag.
//  0. Online drags make no clash (no false alarms).
//  A. Offline: move a box. Someone else moves it too. Online -> clash "changed", ⚠ 1, marker
//     on the box; panel "Use theirs" -> server back to their position, clash resolved.
//  B. Offline: move it. Someone else deletes it. Online -> clash "restored", box back on the
//     server; panel "Delete it" -> gone, clash resolved.
// Test room only; cleans up its box + clash rows. Screenshots to argv[2].
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? '26f8c90d-f35e-46e3-ae04-10a6cf7e1b48'   // RHK1234 Kitchen Test Room
const TAG = 'ZZ_CLASHTEST'
const INK = '#ff00aa'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.log('sign-in failed', error.message); process.exit(1) } }

let pass = true
const check = (ok, msg) => { console.log(ok ? 'PASS' : 'FAIL', msg); if (!ok) pass = false }
const ID = crypto.randomUUID()
const geomAt = x => ({ a: { x, y: 2600 }, b: { x: x + 600, y: 3000 }, rot: 0 })
const serverRow = async () => (await sb.from('room_annotations').select('*').eq('id', ID).maybeSingle()).data
const openClashes = async () => (await sb.from('annotation_clashes').select('*').eq('annotation_id', ID).is('resolved_at', null)).data ?? []

const { error: insErr } = await sb.from('room_annotations').insert({ id: ID, room_id: ROOM, view: 'plan', kind: 'rect', geom: geomAt(2600),
  style: { weight: 1, color: INK, block: TAG }, sort_order: 990 })
if (insErr) { console.log('seed failed', insErr.message); process.exit(1) }

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error' && !/Failed to fetch|ERR_INTERNET/.test(m.text())) console.log('console:', m.text().slice(0, 200)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(3000)
  await page.mouse.click(1000, 900); await page.keyboard.press('F7'); await sleep(800)

  const boxRect = () => page.evaluate(ink => {
    const r = [...document.querySelectorAll('g[data-layer="annotations"] rect')].find(e => e.getAttribute('stroke') === ink)
    if (!r) return null
    const b = r.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }
  }, INK)
  const dragBox = async dx => {
    const b = await boxRect(); if (!b) throw new Error('test box not on screen')
    const x = b.x + 1, y = b.y + b.h / 2       // on its left edge
    await page.mouse.move(x, y); await page.mouse.down()
    await page.mouse.move(x + dx / 2, y, { steps: 5 }); await page.mouse.move(x + dx, y, { steps: 5 }); await page.mouse.up()
    await sleep(400); await page.keyboard.press('Escape'); await sleep(300)
  }
  const ui = () => page.evaluate(() => ({
    save: document.querySelector('[data-save-state]')?.getAttribute('data-save-state'),
    clashes: Number(document.querySelector('[data-clash-count]')?.getAttribute('data-clash-count') ?? 0),
    marks: document.querySelectorAll('[data-clash-mark]').length,
  }))
  const clickPanel = async action => {
    await page.click('[data-clash-count]'); await sleep(400)
    await page.click(`[data-clash-action="${action}"]`); await sleep(2500)
  }

  // ── 0: online edits, no clash
  const x0 = (await serverRow()).geom.a.x
  await dragBox(60); await sleep(1500); await dragBox(60); await sleep(2500)
  const r0 = await serverRow()
  check(r0.geom.a.x > x0, `0: online drags saved (x ${x0} -> ${r0.geom.a.x})`)
  check((await openClashes()).length === 0 && (await ui()).clashes === 0, '0: no clash from my own edits')

  // ── A: both moved it
  await page.setOfflineMode(true); await sleep(400)
  await dragBox(80); await sleep(800)
  const theirsGeom = geomAt(1500)
  await sb.from('room_annotations').update({ geom: theirsGeom }).eq('id', ID)        // someone else
  await page.setOfflineMode(false); await sleep(5000)
  const cA = await openClashes(), uA = await ui()
  console.log('A ui', JSON.stringify(uA), 'clashes', cA.map(c => c.kind))
  check(cA.length === 1 && cA[0].kind === 'changed', 'A: clash logged as changed')
  check(cA[0]?.theirs?.geom?.a?.x === 1500, 'A: their version kept in the clash')
  check((await serverRow()).geom.a.x !== 1500, 'A: my move won (last change)')
  check(uA.clashes === 1 && uA.marks === 1, 'A: ⚠ 1 and a marker on the box')
  await page.screenshot({ path: path.join(OUT, 'o1b-a-marker.png') })
  await page.click('[data-clash-count]'); await sleep(400)
  await page.screenshot({ path: path.join(OUT, 'o1b-a-panel.png') })
  await page.click('[data-clash-action="theirs"]'); await sleep(3000)
  check((await serverRow()).geom.a.x === 1500, 'A: Use theirs put their position back')
  check((await openClashes()).length === 0, 'A: clash resolved')
  const uA2 = await ui()
  check(uA2.clashes === 0 && uA2.marks === 0, 'A: ⚠ and marker gone')

  // ── B: they deleted it, I moved it
  await page.setOfflineMode(true); await sleep(400)
  await dragBox(80); await sleep(800)
  await sb.from('room_annotations').delete().eq('id', ID)                            // someone else
  await page.setOfflineMode(false); await sleep(5000)
  const cB = await openClashes()
  console.log('B clashes', cB.map(c => c.kind), 'ui', JSON.stringify(await ui()))
  check(cB.length === 1 && cB[0].kind === 'restored', 'B: clash logged as restored')
  check(!!(await serverRow()), 'B: my edit put the box back')
  await clickPanel('delete')
  check(!(await serverRow()), 'B: Delete it removed it')
  check((await openClashes()).length === 0, 'B: clash resolved')
} finally {
  await browser.close()
  await sb.from('room_annotations').delete().eq('id', ID)
  await sb.from('annotation_clashes').delete().eq('annotation_id', ID)
  console.log('cleanup done')
  console.log(pass ? 'ALL PASS' : 'SOME FAILED')
}
