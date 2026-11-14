// Offline step 1 (z_offline/OFFLINE-SPEC.md): CAD drawn with no signal is kept and sent later.
//  A. Offline: draw a box -> badge "Offline", server unchanged. Back online -> badge "Saved", row on server.
//  B. Offline: draw a box, close the tab (still offline). New tab online -> the waiting box shows and saves.
// Test room only; removes the boxes it made. Screenshots to argv[2].
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? '26f8c90d-f35e-46e3-ae04-10a6cf7e1b48'   // RHK1234 Kitchen Test Room
const sleep = ms => new Promise(r => setTimeout(r, ms))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.log('sign-in failed', error.message); process.exit(1) } }

const serverIds = async () => new Set(((await sb.from('room_annotations').select('id').eq('room_id', ROOM)).data ?? []).map(r => r.id))
const before = await serverIds()
let pass = true
const check = (ok, msg) => { console.log(ok ? 'PASS' : 'FAIL', msg); if (!ok) pass = false }

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
try {
  const openTab = async () => {
    const page = await browser.newPage()
    await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
    await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
    await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
    await sleep(3000)
    return page
  }
  const badge = page => page.evaluate(() => { const b = document.querySelector('[data-save-state]'); return b ? `${b.getAttribute('data-save-state')} "${b.textContent}"` : 'none' })
  const drawBox = async (page, x, y) => {
    await page.mouse.click(1000, 900); await page.keyboard.press('F7'); await sleep(600)
    await page.keyboard.press('r'); await sleep(200)
    for (const [px, py] of [[x, y], [x + 120, y + 90]]) { await page.mouse.move(px, py, { steps: 3 }); await page.mouse.down(); await page.mouse.up(); await sleep(250) }
    await page.keyboard.press('Escape'); await sleep(200); await page.keyboard.press('F7'); await sleep(800)
  }

  // ── A: offline, then reconnect in the same tab
  let page = await openTab()
  console.log('badge at start:', await badge(page))
  await page.setOfflineMode(true); await sleep(500)
  await drawBox(page, 700, 500)
  await sleep(2500)
  const bA = await badge(page)
  console.log('badge offline:', bA)
  check(bA.startsWith('offline') && bA.includes('1'), 'A: badge shows Offline with 1 waiting')
  check((await serverIds()).size === before.size, 'A: nothing reached the server while offline')
  await page.screenshot({ path: path.join(OUT, 'o1-a-offline.png') })
  await page.setOfflineMode(false)
  await sleep(4000)
  const bA2 = await badge(page)
  console.log('badge back online:', bA2)
  check(bA2.startsWith('saved'), 'A: badge back to Saved')
  const afterA = await serverIds()
  check(afterA.size === before.size + 1, `A: box saved on reconnect (${before.size} -> ${afterA.size})`)
  await page.screenshot({ path: path.join(OUT, 'o1-a-online.png') })

  // ── B: offline, close the tab, reopen online
  await page.setOfflineMode(true); await sleep(500)
  await drawBox(page, 900, 500)
  await sleep(1500)
  console.log('badge B offline:', await badge(page))
  await page.close({ runBeforeUnload: false })
  check((await serverIds()).size === afterA.size, 'B: nothing reached the server before the tab closed')
  page = await openTab()
  await sleep(4000)
  const bB = await badge(page)
  console.log('badge B reopened:', bB)
  const afterB = await serverIds()
  check(afterB.size === afterA.size + 1, `B: waiting box sent on next open (${afterA.size} -> ${afterB.size})`)
  check(bB.startsWith('saved'), 'B: badge Saved')
  await page.screenshot({ path: path.join(OUT, 'o1-b-reopened.png') })
} finally {
  await browser.close()
  const made = [...await serverIds()].filter(id => !before.has(id))
  if (made.length) await sb.from('room_annotations').delete().in('id', made)
  console.log('cleanup: removed', made.length, 'test boxes')
  console.log(pass ? 'ALL PASS' : 'SOME FAILED')
}
