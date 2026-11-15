// RHK6468 Laundry rev 3 (Mark 2026-11-15): 5 top overhang past the BEPF at the door.
// BC-01 / BC-02 1094 -> 1091.5, BEPF 2854.5 -> 2849.5 (top stays to 2871).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = '874fed25-8e1b-4bbf-b1ff-3090361b5dad'
const show = async t => console.log(t, JSON.stringify((await sb.from('cabinet_instances').select('label,pos_x,dx,dy,pos_z').eq('room_id', R).order('label')).data),
  JSON.stringify((await sb.from('room_fixtures').select('display_name,x,y').eq('room_id', R)).data))
await show('before')
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  const api = async (m, ...a) => { const r = await page.evaluate((m, a) => window.__canvasApi[m](...a), m, a); await sleep(2000); return r }
  console.log(JSON.stringify(await api('updateCabinet', 'BC-03', { offset: 2849.5 })))
  console.log(JSON.stringify(await api('updateCabinet', 'BC-02', { offset: 1758, dx: 1091.5 })))
  console.log(JSON.stringify(await api('updateCabinet', 'BC-01', { offset: 666.5, dx: 1091.5 })))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify((st.cabinets ?? []).filter(c => /BC|KICK/.test(c.label)).map(c => ({ l: c.label, off: c.offset, dx: c.dx, dy: c.dy }))))
  console.log(JSON.stringify((st.fixtures ?? []).map(f => ({ name: f.display_name ?? f.name, cabinet: f.cabinet, clash: f.clash }))))
} finally { await browser.close() }
await show('after')
