// RHK6595 (Mark 2026-11-11): overheads 625 clear over the 950 bench to the under panel underside (Mark's 30/10 answer 13:
// 765 overall, top 2340). They were drawn 747 (under panel inside the SCRBT 18 scribe) = 643 clear.
// WC-04/05/06 dy 747 -> 765 (hang from the 2340 top line), under panel WC-12 pos_z 1593 -> 1575.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', WC12 = '9ab7393e-0518-4293-a24d-ad5477c073da'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const { data: [u] } = await sb.from('cabinet_instances').select('pos_z').eq('id', WC12)
console.log('WC-12 pos_z before', u.pos_z)
const r = await sb.from('cabinet_instances').update({ pos_z: 1575 }).eq('id', WC12); console.log('WC-12 pos_z 1575', r.error?.message ?? 'ok')
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 300000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 300000 }); await sleep(5000)
  for (const [l, p] of [['WC-04', { dy: 765 }], ['WC-05', { dy: 765 }], ['WC-06', { dy: 765 }], ['WC-12', { dz: 310 }]]) {
    await page.evaluate(([l, p]) => window.__canvasApi.updateCabinet(l, p), [l, p]); await sleep(2500)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, 'zones', JSON.stringify((rp.face_zones ?? []).map(z => [z.face_type, z.Y, z.DY])), 'err', JSON.stringify([...(rp.errors ?? []), ...(rp.warnings ?? [])].map(e => e.code)))
  }
  const { data } = await sb.from('cabinet_instances').select('label,pos_z,dy').eq('room_id', R).in('label', ['WC-04', 'WC-05', 'WC-06', 'WC-07', 'WC-12'])
  console.log(JSON.stringify(data))
} finally { await browser.close() }
