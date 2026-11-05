// RHK6592 rev 18 (Mark 2026-11-05): kitchen BC-03 oven space 604 -> 600 between the false panels (open row 600 + the two
// 2 gaps was 604, so the row is OVEN_ROW), top + bottom false panels even (both unlocked, equal share).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const KIT = 'dc7a22f3-ed0b-4771-a42e-4548fc4de1e1'
const { data: c } = await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', KIT).eq('label', 'BC-03').single()
const fg = c.face_grid
if (process.env.OVEN_ROW) {
  fg.rows = fg.rows.map(r => r.row_index === 1 ? { ...r, height: Number(process.env.OVEN_ROW), height_locked: true } : { row_index: r.row_index, height_locked: false })
  const u = await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id); if (u.error) throw u.error
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss()); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${KIT}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi'); await new Promise(r => setTimeout(r, 1500))
  const r = await page.evaluate(async () => { const x = await window.__canvasApi.getResolved('BC-03')
    return { zones: x.face_zones.map(z => [z.row_index, z.face_type, z.Y, z.DY]), open: x.open_zones, err: [...x.errors, ...x.warnings].map(e => e.code) } })
  console.log(JSON.stringify(r))
} finally { await browser.close() }
