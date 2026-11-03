// RHK6478 Kitchen: BC-10 (side unit S/M/L) fronts to match BC-02 where they fit (Mark 2026-11-04): bottom 330, middle 220
// locked, top takes the rest (130: BC-10 has 720 of fronts + gaps under its 20 top gap vs BC-02's 740).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6'
const { data: [c] } = await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', R).eq('label', 'BC-10')
console.log('before', JSON.stringify(c.face_grid))
const fg = structuredClone(c.face_grid)
fg.rows = [{ row_index: 0, height: 330, height_locked: true }, { row_index: 1, height: 220, height_locked: true }, { row_index: 2, height_locked: false }]
const r = await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id)
console.log(r.error?.message ?? 'set')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]); await sleep(2000); return r }
  await api('updateCabinet', 'BC-10', { dz: 630 })
  const res = await api('getResolved', 'BC-10')
  console.log('zones', JSON.stringify(res.face_zones.map(z => [z.row_index, z.Y, z.DY])))
  console.log('rails', JSON.stringify(res.case_parts.filter(p => p.part_key.startsWith('fprail')).map(p => [p.Y, p.DX])))
  console.log('boxes', JSON.stringify(res.drawer_stacks.map(s => [s.face_zone_row, s.box_Y, s.box_height])))
  console.log('issues', JSON.stringify((await api('getIssues')).filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
