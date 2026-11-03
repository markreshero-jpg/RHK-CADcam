// RHK6478 Laundry: tower drawer BC-01's kick runs 18 past each side, under the tower panels (kick to shadowline).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const { data: c } = await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', R).eq('label', 'BC-01').single()
await sb.from('cabinet_instances').update({ rule_overrides: { ...(c.rule_overrides ?? {}), TOESCL: -18, TOESCR: -18 }, notes: 'Tower drawer 260 under the washer; kick runs 18 past each side under the tower panels' }).eq('id', c.id)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 120000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  await page.evaluate(() => window.__canvasApi.updateCabinet('BC-01', { dz: 680 })); await sleep(1500)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('BC-01'))
  console.log(JSON.stringify(rp.case_parts.filter(p => /toe|kick/i.test(p.part_key)).map(p => [p.part_key, p.X, p.DX, p.DY, p.DZ])))
  console.log(JSON.stringify((rp.toekick_parts ?? rp.kick_parts ?? []).map(p => [p.part_key ?? p.name, p.X, p.DX, p.DY])))
  console.log(JSON.stringify(rp.errors ?? []), JSON.stringify(rp.warnings ?? []))
} finally { await browser.close() }
