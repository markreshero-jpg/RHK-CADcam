// RHK6595 (Mark 2026-11-11): bulkheads WC-08 / WC-09 / WC-11 vertical grain (B13). WC-09 2042.5 splits into 2 pieces.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', L = ['WC-08', 'WC-09', 'WC-11']
const sleep = ms => new Promise(r => setTimeout(r, ms))
for (const c of (await sb.from('cabinet_instances').select('id,label,bulkhead').eq('room_id', R).in('label', L)).data) {
  const r = await sb.from('cabinet_instances').update({ bulkhead: { ...c.bulkhead, grain: 'vertical' } }).eq('id', c.id)
  console.log(c.label, 'grain vertical', r.error?.message ?? 'ok')
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 300000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 300000 }); await sleep(6000)
  for (const l of L) {
    const c = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(x => x.label === l)
    await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [l, c.dy]); await sleep(3000)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, JSON.stringify((rp.case_parts ?? []).map(p => [p.part_key, p.DX, p.DY, p.grain_direction ?? '-', p.material_id?.slice(0, 8)])), 'err', JSON.stringify([...(rp.errors ?? []), ...(rp.warnings ?? [])].map(e => e.code)))
  }
} finally { await browser.close() }
const { data } = await sb.from('case_parts').select('part_key,dx,dy,grain_direction,cabinet_instance_id').like('part_key', 'bh:%').in('cabinet_instance_id', (await sb.from('cabinet_instances').select('id').eq('room_id', R).in('label', L)).data.map(c => c.id))
console.log('persisted', JSON.stringify(data.map(p => [p.part_key, p.dx, p.dy, p.grain_direction])))
