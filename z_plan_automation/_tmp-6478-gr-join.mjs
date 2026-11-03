// RHK6478 Guest Robe TC-03: close the duct box-out inside corner (one back runs through by back.t) + tape its seen edge
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '19f84132-6ed5-49b5-a0da-0f916966dcbb'
const through = process.argv[2] ?? 'duct_side'
const c = chk('c', await sb.from('cabinet_instances').select('id,footprint').eq('room_id', R).eq('label', 'TC-03').single())
if (through === 'default') delete c.footprint.joins?.['duct_side|duct_back']; else c.footprint.joins = { ...(c.footprint.joins ?? {}), 'duct_side|duct_back': `through:${through}` }
chk('u', await sb.from('cabinet_instances').update({ footprint: c.footprint }).eq('id', c.id))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  await api('updateCabinet', 'TC-03', { dz: 520 }); await sleep(2000)
  const rp = await api('getResolved', 'TC-03')
  for (const p of rp.case_parts ?? []) if (/back|side/.test(p.part_key ?? p.part_type)) console.log(' ', p.part_key ?? p.part_type, 'X', p.X, 'Y', p.Y, 'Z', p.Z, 'DX', p.DX, 'DY', p.DY, 'DZ', p.DZ, 'eb', JSON.stringify(p.edge_band ?? p.edges ?? null), p.bevel_lo ?? '', p.bevel_hi ?? '')
  const issues = await api('getIssues'); for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log(`  ${ci.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
