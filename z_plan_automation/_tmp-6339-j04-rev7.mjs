// RHK6339 J04 rev 7 (Mark 2026-11-12): shadowline on top of WC-03 wider - 10 -> 60 high (same strip, same set back 20).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b2252689-fdc9-4fd7-be9a-f29853f0391e'
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const wc3 = chk('wc3', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'WC-03').single())
const strip = chk('strip', await sb.from('cabinet_custom_parts').select('id,dy,name').eq('cabinet_instance_id', wc3.id).ilike('name', 'Shadowline strip%').single())
console.log('before', strip.name, strip.dy)
chk('upd', await sb.from('cabinet_custom_parts').update({ dy: 60, name: 'Shadowline strip 60 (PT Black Matt, set back 20)' }).eq('id', strip.id))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('WC-03', { dz: 510 })))); await sleep(3000)
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', ci.label, e.code, e.message)
} finally { await browser.close() }
console.log('after', chk('chk', await sb.from('cabinet_custom_parts').select('name,x,y,z,dx,dy,dz').eq('id', strip.id).single()))
