// RHK6548 Water Station (Mark 2026-11-27): 35 filler deleted; shadowline drops onto the 752 box -> 770 overall.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const WS = '2bed2187-0b9c-4cf3-9e3e-5d29be5538a0'
const cabs = chk('q', await sb.from('cabinet_instances').select('id,label,notes,dy').eq('room_id', WS))
const filler = cabs.find(c => (c.notes ?? '').startsWith('35 filler'))
if (filler) { chk('del', await sb.from('cabinet_instances').delete().eq('id', filler.id)); console.log('deleted', filler.label) }
const sl = cabs.find(c => (c.notes ?? '').startsWith('SHADOWLINE'))
chk('sl', await sb.from('cabinet_instances').update({ pos_z: 752, notes: 'SHADOWLINE 18 full width, 752-770' }).eq('id', sl.id))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${WS}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) console.log(ci.label, ci.dims, JSON.stringify([...ci.errors, ...ci.warnings].map(e => e.code)))
} finally { await browser.close() }
console.log(JSON.stringify(chk('f', await sb.from('cabinet_instances').select('label,dy,pos_z,notes').eq('room_id', WS))))
process.exit(0)
