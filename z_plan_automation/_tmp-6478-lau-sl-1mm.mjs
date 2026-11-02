// RHK6478 Laundry: WC-10 shadowline started at 1499 (1 into WC-09's right return) -> 1500, dx 1988 (end stays 3488).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const u = await sb.from('cabinet_instances').update({ pos_x: 1500, dx: 1988 }).eq('room_id', R).eq('label', 'WC-10')
if (u.error) throw u.error
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('WC-10', { dy: 18 })))); await sleep(2000)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify(st.cabinets.filter(c => ['WC-09', 'WC-10'].includes(c.label))))
  console.log('issues', JSON.stringify((await page.evaluate(() => window.__canvasApi.getIssues())).filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
