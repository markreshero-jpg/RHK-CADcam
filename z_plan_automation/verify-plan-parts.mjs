// Plan carcase-part outlines: dump each cabinet's footprint + case-part polygons
// in cabinet-local (along-wall, depth) coords, and screenshot the plan.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'

const REPO = 'C:/Projects/RHK-CADcam'
const PORT = process.env.DEV_PORT ?? '3001'
const OUT = process.argv[2] ?? 'plan-parts.png'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const env = Object.fromEntries(fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split('\n').filter(l => l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
// No anonymous DB access (z_access_control) — sign in as the automation account.
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.error("automation sign-in failed (AUTOMATION_EMAIL/PASSWORD in .env.local):", error.message); process.exit(1) } }

let roomId = process.env.ROOM_ID
if (!roomId) {
  const { data } = await sb.from('cabinet_instances').select('room_id, updated_at').order('updated_at', { ascending: false }).limit(1)
  roomId = data[0].room_id
}
console.log('room', roomId)
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run', '--disable-gpu'], defaultViewport: { width: 1720, height: 950 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:${PORT}/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(5000)
  const dump = await page.evaluate(() => {
    const out = []
    for (const g of document.querySelectorAll('g')) {
      const parts = [...g.querySelectorAll(':scope > polygon[data-part]')]
      if (!parts.length) continue
      const P = s => s.trim().split(/\s+/).map(q => q.split(',').map(Number))
      const foot = P(g.querySelector(':scope > polygon').getAttribute('points'))
      const [a, b, , e] = foot
      const L = (u) => Math.hypot(u[0], u[1])
      const wd = [b[0] - a[0], b[1] - a[1]], dx = L(wd); wd[0] /= dx; wd[1] /= dx
      const pp = [e[0] - a[0], e[1] - a[1]], dz = L(pp); pp[0] /= dz; pp[1] /= dz
      const loc = q => [Math.round((q[0] - a[0]) * wd[0] + (q[1] - a[1]) * wd[1]), Math.round((q[0] - a[0]) * pp[0] + (q[1] - a[1]) * pp[1])]
      const label = g.querySelector(':scope > text')?.textContent
      out.push({ label, dx: Math.round(dx), dz: Math.round(dz), parts: parts.map(p => {
        const pts = P(p.getAttribute('points')).map(loc)
        const xs = pts.map(q => q[0]), zs = pts.map(q => q[1])
        return `${p.dataset.part}: x ${Math.min(...xs)}..${Math.max(...xs)}  z ${Math.min(...zs)}..${Math.max(...zs)}`
      }) })
    }
    return out
  })
  for (const c of dump) console.log(c.label, `dx=${c.dx} dz=${c.dz}\n  ` + c.parts.join('\n  '))
  await page.screenshot({ path: OUT })
} finally { await browser.close() }
