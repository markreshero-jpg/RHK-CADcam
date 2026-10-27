// Grain match G1 (z_grain_match): in the Test Kitchen plan, Shift-pick TC-01 + BC-01,
// right-click → Grain match (2) › Horizontal; right-click again → the GM menu shows,
// switch to vertical, then Remove GM. Prints DB state after each step + screenshots.
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
const dbState = async () => {
  const { data: cabs } = await sb.from('cabinet_instances').select('label, grain_match_group_id').eq('room_id', ROOM)
  const { data: gs } = await sb.from('grain_match_groups').select('id, name, direction').eq('room_id', ROOM)
  const name = id => gs.find(g => g.id === id)?.name ?? (id ? '?' : '-')
  return { groups: gs.map(g => `${g.name}:${g.direction}`), cabs: cabs.map(c => `${c.label}=${name(c.grain_match_group_id)}`).join(' ') }
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(4000)
  const ids = await page.evaluate(() => Object.fromEntries(window.__canvasApi.getState().cabinets.map(c => [c.label, c.id])))
  const centre = id => page.evaluate(i => {
    const r = document.querySelector(`polygon[data-cab-id="${i}"]`)?.getBoundingClientRect()
    return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, id)
  const menuTexts = () => page.evaluate(() => [...document.querySelectorAll('button, [role=menuitem]')].filter(b => b.offsetParent).map(b => b.textContent.trim()).filter(t => /grain|vertical|horizontal|GM\d/i.test(t)))
  const clickText = async re => {
    const ok = await page.evaluate(src => {
      const re = new RegExp(src)
      const el = [...document.querySelectorAll('button, [role=menuitem], div, span')].filter(b => b.offsetParent && re.test(b.textContent.replace('›', '').trim()) && b.children.length <= 2).pop()
      if (!el) return false
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      el.click(); return true
    }, re.source)
    console.log('click', re.source, ok); await sleep(800)
  }

  const tc = await centre(ids['TC-01']), bc = await centre(ids['BC-01'])
  console.log('centres', JSON.stringify({ tc, bc }))
  await page.keyboard.down('Shift')
  await page.mouse.click(tc.x, tc.y); await sleep(300)
  await page.mouse.click(bc.x, bc.y); await sleep(300)
  await page.keyboard.up('Shift')
  await page.mouse.click(bc.x, bc.y, { button: 'right' }); await sleep(800)
  console.log('menu 1', JSON.stringify(await menuTexts()))
  await clickText(/^Grain match \(2\)$/)
  await shot(page, 'gm-1-menu.png')
  await clickText(/^Horizontal ↔$/)
  await sleep(1500)
  console.log('after create', JSON.stringify(await dbState()))

  await page.mouse.click(bc.x, bc.y, { button: 'right' }); await sleep(800)
  console.log('menu 2', JSON.stringify(await menuTexts()))
  await clickText(/^Grain match GM\d+ ↔ horizontal$/)
  await shot(page, 'gm-2-group-menu.png')
  await clickText(/^Switch to vertical ↕$/)
  await sleep(1500)
  console.log('after switch', JSON.stringify(await dbState()))

  await page.mouse.click(tc.x, tc.y, { button: 'right' }); await sleep(800)
  await clickText(/^Grain match GM\d+ ↕ vertical$/)
  await clickText(/^Remove GM\d+ \(2 cabinets\)$/)
  await sleep(1500)
  console.log('after remove', JSON.stringify(await dbState()))
} finally {
  await browser.close()
}
