// RHK6478 Guest Robe: kick back 200 off the wall (TOESCB 200) to clear the duct box-out in the right back corner
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '19f84132-6ed5-49b5-a0da-0f916966dcbb'
const k = chk('k', await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', R).eq('label', 'BC-01').single())
chk('u', await sb.from('cabinet_instances').update({ rule_overrides: { ...(k.rule_overrides ?? {}), TOESCB: 200 } }).eq('id', k.id))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  await api('updateCabinet', 'BC-01', { dz: 540 }); await sleep(2000)
  const kp = await api('getResolved', 'BC-01')
  for (const p of kp.toekick_parts ?? []) console.log(' kick', p.part_key ?? p.part_type, 'X', p.X, 'Z', p.Z, 'DX', p.DX, 'DY', p.DY, 'DZ', p.DZ)
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
