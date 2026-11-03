// RHK6478 Kitchen: WC-01 (overhead over the pocket unit) back to plain carcass inside - Timbergrain only in TC-07 (Mark 2026-11-04).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6'
const r = await sb.from('cabinet_instances').update({ material_overrides: {}, exposed_interior: false, notes: '# 13 overhead over the pocket unit 1940-2672, 1 adj' }).eq('room_id', R).eq('label', 'WC-01').select('label')
console.log(r.error?.message ?? JSON.stringify(r.data))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]); await sleep(2000); return r }
  console.log(JSON.stringify(await api('updateCabinet', 'WC-01', { dz: 400 })))
  const res = await api('getResolved', 'WC-01')
  console.log([...new Set((res.case_parts ?? []).map(p => p.material_name ?? p.material_id))].join(' | '))
  console.log('issues', JSON.stringify((await api('getIssues')).filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
