// RHK6478 DS Linen (2026-11-18, pre-nest): fillers TC-01 / TC-03 were Whiteboard 16.5 with dz pinned 18 -> Satin Board 18 White
// (2pac 25W, as the notes / spec block say) via material_override_id, so the resolve keeps it.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const R = process.argv[2] ?? 'f1953ab4-a03b-4439-a777-d39476156f31', SATIN = 'b07a7e40-facd-4cdf-8856-60712e940b44'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,dz').eq('room_id', R))
const fl = chk('fl', await sb.from('cabinet_custom_parts').select('id,cabinet_instance_id').in('cabinet_instance_id', cabs.map(c => c.id)).eq('name', 'Filler'))
for (const f of fl) chk('upd', await sb.from('cabinet_custom_parts').update({ material_id: SATIN, material_override_id: SATIN }).eq('id', f.id))
console.log('fillers', fl.length)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
  for (const c of cabs.filter(c => fl.some(f => f.cabinet_instance_id === c.id))) { await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [c.id, c.dz]); await sleep(1500) }
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const x of iss) for (const e of [...x.errors, ...x.warnings]) console.log('ISSUE', x.label, e.code, e.message)
} finally { await browser.close() }
const after = chk('after', await sb.from('cabinet_custom_parts').select('material_id,dz').in('id', fl.map(f => f.id)))
console.log(JSON.stringify(after))
process.exit(0)
