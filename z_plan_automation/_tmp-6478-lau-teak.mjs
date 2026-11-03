// RHK6478 Laundry: PDR fillers TC-10 / TC-11 in Lx Sublime Teak Chalk to match BC-07 (material_overrides.exposed).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc', TEAK_BOARD = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b'
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,material_overrides').eq('room_id', R).in('label', ['TC-10', 'TC-11'])
for (const c of cabs) console.log(c.label, (await sb.from('cabinet_instances').update({ material_overrides: { ...(c.material_overrides ?? {}), exposed: TEAK_BOARD } }).eq('id', c.id)).error?.message ?? 'ok')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  for (const l of ['TC-10', 'TC-11', 'BC-07']) {
    await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 476.5 }), l); await sleep(1200)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, JSON.stringify([...rp.custom_parts.map(p => [p.name, p.material_id?.slice(0, 8)]), ...rp.face_zones.map(z => ['front', z.material_id?.slice(0, 8)])]))
  }
} finally { await browser.close() }
