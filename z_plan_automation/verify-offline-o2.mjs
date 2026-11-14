// Offline step 2 (z_offline/OFFLINE-SPEC.md): Take offline, then open a room with no signal.
// Needs a PRODUCTION server (the service worker is production-only):
//   npx next build && npx next start -p 3002      then   node z_plan_automation/verify-offline-o2.mjs <shots dir>
// Steps: log in -> Take offline on RHK1234 -> no signal -> /canvas/<room> opens the offline
// copy with its cabinets -> draw a box -> reload (still no signal) -> box still there ->
// / shows Rooms on this device -> signal back -> live page, box on the server. Cleans up.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

const OUT = process.argv[2] ?? '.'
const BASE = process.env.BASE ?? 'http://localhost:3002'
const ROOM = process.env.ROOM_ID ?? '26f8c90d-f35e-46e3-ae04-10a6cf7e1b48'   // RHK1234 Kitchen Test Room
const JOB = 'RHK1234'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.log('sign-in failed', error.message); process.exit(1) } }
const serverIds = async () => new Set(((await sb.from('room_annotations').select('id').eq('room_id', ROOM)).data ?? []).map(r => r.id))
const before = await serverIds()

let pass = true
const check = (ok, msg) => { console.log(ok ? 'PASS' : 'FAIL', msg); if (!ok) pass = false }
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })
// No signal for the page AND its service worker (DevTools' offline switch on a page doesn't
// reach the worker, which would otherwise still fetch from the network).
const swSessions = new Map()   // emulation belongs to the CDP session, so reuse it
async function setOffline(browser, page, off) {
  await page.setOfflineMode(off)
  for (const t of browser.targets().filter(t => t.type() === 'service_worker')) {
    let s = swSessions.get(t)
    if (!s) { s = await t.createCDPSession(); await s.send('Network.enable'); swSessions.set(t, s) }
    await s.send('Network.emulateNetworkConditions', { offline: off, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rhk-o2-'))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: profile,
  args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message.slice(0, 200)))

  // ── log in
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.type('input[name="email"]', env.AUTOMATION_EMAIL)
  await page.type('input[name="password"]', env.AUTOMATION_PASSWORD)
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }), page.keyboard.press('Enter')])
  check(!page.url().includes('/login'), `logged in (${page.url()})`)
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, { timeout: 60000 }).catch(() => {})
  check(await page.evaluate(() => !!navigator.serviceWorker?.controller), 'service worker controls the page')

  // ── Take offline on the test job (search for it: it may not be in Active jobs)
  await page.type('input[placeholder^="Search jobs"]', JOB)
  await sleep(2500)
  const clicked = await page.evaluate(job => {
    for (const b of document.querySelectorAll('[data-take-offline]')) {
      let el = b
      while (el && el.querySelectorAll('[data-take-offline]').length <= 1 && !el.textContent.includes(job)) el = el.parentElement
      if (el && el.textContent.includes(job) && el.querySelectorAll('[data-take-offline]').length === 1) { b.setAttribute('data-test-target', '1'); b.click(); return true }
    }
    return false
  }, JOB)
  check(clicked, 'found Take offline on the test job')
  await page.waitForFunction(() => { const b = document.querySelector('[data-test-target]'); return b && ['done', 'error'].includes(b.getAttribute('data-take-offline')) }, { timeout: 600000 })
  const label = await page.$eval('[data-test-target]', b => `${b.getAttribute('data-take-offline')} "${b.textContent}"`)
  console.log('take offline:', label)
  check(label.startsWith('done') && !label.includes('try again'), 'Take offline saved every room')
  await shot(page, 'o2-1-taken.png')
  await sleep(3000)   // let the forced shell refresh finish

  // ── no signal: open the room
  await setOffline(browser, page, true)
  await page.goto(`${BASE}/canvas/${ROOM}`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('[data-offline-copy]', { timeout: 60000 }).catch(() => {})
  await sleep(4000)
  check(page.url().includes('/offline/canvas?room='), `redirected to the offline canvas (${page.url()})`)
  check(!!await page.$('[data-offline-copy]'), 'offline copy banner shows')
  const body = await page.evaluate(() => document.body.innerText)
  check(/BC-0\d/.test(body), 'cabinets drawn from the copy')
  await shot(page, 'o2-2-offline-canvas.png')

  // draw a box with no signal
  await page.mouse.click(1000, 900); await page.keyboard.press('F7'); await sleep(700)
  await page.keyboard.press('r'); await sleep(200)
  for (const [x, y] of [[700, 500], [820, 590]]) { await page.mouse.move(x, y, { steps: 3 }); await page.mouse.down(); await page.mouse.up(); await sleep(250) }
  await page.keyboard.press('Escape'); await sleep(1500)
  const light = await page.$eval('[data-save-state]', b => `${b.getAttribute('data-save-state')} "${b.textContent}"`)
  console.log('light:', light)
  check(light.startsWith('offline'), 'box waiting (offline light)')
  // Red outline = the box (the default markup colour); the selection outline is blue.
  const marks = async () => page.evaluate(() => [...document.querySelectorAll('g[data-layer="annotations"] rect')].filter(r => r.getAttribute('stroke') === '#dc2626').length)
  const nBefore = await marks()
  await sleep(2500)   // snapshot save

  // reload, still no signal
  await page.reload({ waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('[data-offline-copy]', { timeout: 60000 }).catch(() => {})
  await sleep(4000)
  check(!!await page.$('[data-offline-copy]'), 'reload with no signal opens the copy again')
  check(await marks() >= nBefore && nBefore > 0, `box still there after reload (${nBefore} -> ${await marks()} rects)`)
  check((await serverIds()).size === before.size, 'nothing sent while offline')
  await shot(page, 'o2-3-reloaded.png')

  // other pages with no signal -> Rooms on this device
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 })
  await sleep(2500)
  const listed = await page.$$eval('[data-offline-room]', as => as.map(a => a.textContent))
  console.log('rooms on device:', listed.join(', '))
  check(listed.length > 0, 'home with no signal shows Rooms on this device')
  await shot(page, 'o2-4-rooms.png')

  // ── signal back
  await setOffline(browser, page, false)
  await sleep(1500)
  const t0 = Date.now()
  await page.goto(`${BASE}/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  console.log('online open took', Date.now() - t0, 'ms ->', page.url(), 'sw targets', browser.targets().filter(t => t.type() === 'service_worker').length)
  await sleep(6000)
  check(!page.url().includes('/offline'), 'online: the live page opens')
  const after = await serverIds()
  check(after.size === before.size + 1, `box drawn offline reached the server (${before.size} -> ${after.size})`)
} finally {
  await browser.close()
  const made = [...await serverIds()].filter(id => !before.has(id))
  if (made.length) await sb.from('room_annotations').delete().in('id', made)
  console.log('cleanup: removed', made.length)
  try { fs.rmSync(profile, { recursive: true, force: true }) } catch { /* chrome lock */ }
  console.log(pass ? 'ALL PASS' : 'SOME FAILED')
}
