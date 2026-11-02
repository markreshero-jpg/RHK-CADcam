// RHK6478 Bed 2 Robe: inspect resolved parts
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = process.argv[2] ?? '761f434a-cdc8-4cb8-b1dc-da69ae78f12a'
const labels = (process.argv[3] ?? '').split(',').filter(Boolean)
const { data: cabs } = await sb.from('cabinet_instances').select('label,pos_x,pos_y,pos_z,dx,dy,dz,has_toekick,has_carcass').eq('room_id', R).order('label')
for (const c of cabs) console.log(JSON.stringify(c))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  for (const l of labels.length ? labels : cabs.map(c => c.label)) {
    const rp = await api('getResolved', l)
    console.log('==', l, Object.keys(rp ?? {}).join(','))
    for (const k of ['case_parts', 'internal_parts', 'toekick_parts', 'custom_parts', 'face_zones', 'bulkhead_parts', 'accessories']) {
      for (const p of rp?.[k] ?? []) console.log(' ', k, p.part_key ?? p.part_type ?? p.name, 'X', p.X, 'Y', p.Y, 'Z', p.Z, 'D', p.DX, p.DY, p.DZ, p.material_name ?? p.material_id ?? '')
    }
  }
} finally { await browser.close() }
