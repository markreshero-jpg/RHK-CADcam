import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const cabs = (await sb.from('cabinet_instances').select('label,rule_overrides,dy,dz,pos_z').eq('room_id', R).like('label', 'WC-%')).data
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
try {
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await new Promise(r => setTimeout(r, 4000))
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const l of ['WC-11','WC-12','WC-13','WC-14','WC-15','WC-19','WC-20','WC-21','WC-10','WC-16']) {
    const c = cabs.find(c => c.label === l), s = st.cabinets.find(c => c.label === l)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    const r = rp.rules ?? rp.cabinet?.rules ?? {}
    console.log(l, 'ro', JSON.stringify(c.rule_overrides), 'dy', c.dy, 'posz', c.pos_z, s?.pos_z, 'rules', JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => /SCR|REV|UNDER/.test(k)))))
    console.log('   ', JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.DY, p.Y]), ...rp.face_zones.map(z => ['face', z.DY, z.Y, z.zone_type]), ...(rp.custom_parts ?? []).map(p => [p.name, p.Y, p.DZ])]))
  }
  console.log(Object.keys(await page.evaluate(() => window.__canvasApi.getResolved('WC-11'))).join(','))
} finally { await browser.close() }
