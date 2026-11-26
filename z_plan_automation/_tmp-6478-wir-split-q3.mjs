import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'e58340a6-4b68-4543-a1ca-a686b515a647'
const { data: cabs } = await sb.from('cabinet_instances').select('id,label').eq('room_id', R).in('label', ['TC-11', 'TC-15', 'TC-14'])
for (const c of cabs) {
  const { data: cp } = await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', c.id)
  for (const p of cp ?? []) console.log(c.label, 'custom', p.name ?? p.part_name, p.dx, p.dy, p.dz, p.material_id ?? p.material_override_id)
  const { data: parts } = await sb.from('case_parts').select('part_key,dx,dy,dz,material_id').eq('cabinet_instance_id', c.id)
  console.log(c.label, 'case parts', (parts ?? []).map(p => `${p.part_key} ${p.dx}x${p.dy}`).join('; '))
}
const { data: mats } = await sb.from('materials').select('*').ilike('name', '%Sublime Teak%')
for (const m of mats ?? []) console.log('MAT', m.id, m.name, Object.entries(m).filter(([k]) => /sheet|length|width|thick/i.test(k)).map(([k, v]) => `${k}=${v}`).join(' '))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(6000)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('TC-14'))
  const dv = rp.internal_parts.filter(p => p.part_type === 'divider')
  for (const p of dv) console.log('TC-14 divider', JSON.stringify({ X: p.X, Y: p.Y, Z: p.Z, DX: p.DX, DY: p.DY, DZ: p.DZ, key: p.key ?? p.part_key ?? p.id }))
  console.log('TC-14 shelf count', rp.internal_parts.filter(p => p.part_type === 'fixed_shelf').length, 'sample', JSON.stringify(rp.internal_parts.find(p => p.part_type === 'fixed_shelf')))
} finally { await browser.close() }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
