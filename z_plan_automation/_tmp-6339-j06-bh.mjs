// RHK6339 J07: BH pelmet dy back to 80 (updateCabinet left it at 600) + re-resolve.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
console.log((await sb.from('cabinet_instances').update({ dy: 80 }).eq('room_id', R).eq('label', 'WC-02')).error?.message ?? 'dy ok')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('WC-02', { dz: 286 })))); await sleep(4000)
} finally { await browser.close() }
const { data: c } = await sb.from('cabinet_instances').select('id,dy,bulkhead').eq('room_id', R).eq('label', 'WC-02').single()
console.log(c.dy, JSON.stringify(c.bulkhead))
console.log(JSON.stringify((await sb.from('case_parts').select('part_key,x,y,z,dx,dy,dz,material_id').eq('cabinet_instance_id', c.id)).data))
