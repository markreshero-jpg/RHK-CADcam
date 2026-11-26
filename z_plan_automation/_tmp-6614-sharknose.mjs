// RHK6614 (Mark 2026-11-27): job handle schedule was null (fell back to D Handle 160) - set Sharknose Finger Pull, re-resolve.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const P = 'b552f872-a0ad-4954-8e43-a5c4f4e0f301', R = '65c69db5-2aba-49e0-81c8-95c559968aa2'
const SHARKNOSE = '243a2e18-5966-409f-8fec-f056006d5a61'
chk('job', await sb.from('projects').update({ handle_schedule_id: SHARKNOSE }).eq('id', P))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(6000)
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) { const e = [...ci.errors, ...ci.warnings].map(x => x.code + ' ' + x.message); if (e.length) console.log(ci.label, JSON.stringify(e)) }
} finally { await browser.close() }
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label').eq('room_id', R))
for (const z of chk('fz', await sb.from('face_zones').select('cabinet_instance_id,face_type,y,dy,handle').in('cabinet_instance_id', cabs.map(c => c.id))))
  console.log(cabs.find(c => c.id === z.cabinet_instance_id).label, z.face_type, z.y, z.dy, JSON.stringify(z.handle && { n: z.handle.name, k: z.handle.grip_kind }))
process.exit(0)
