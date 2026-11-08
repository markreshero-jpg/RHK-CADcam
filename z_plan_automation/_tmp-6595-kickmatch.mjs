// RHK6595 (Mark 2026-11-08): kicks match the cupboards above them. The job kick face (Whiteboard 16.5, from the
// title block) is removed so the resolver's rule applies (kick face = the cabinet's first front). BC-14 (BFK, no
// fronts) gets a teak kick face to match BC-01; the other no-front kicks fall back to the base front (Winter Sky).
// Before-state of the job row saved to _tmp-6595-kick-before.json.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const P = '0ebb6866-f1ff-4fcf-b000-17dceb207df4', ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11'
const { data: rows } = await sb.from('job_toekick_materials').select('*').eq('project_id', P)
if (rows.length) {
  fs.writeFileSync('z_plan_automation/_tmp-6595-kick-before.json', JSON.stringify(rows, null, 1))
  console.log('job kick face removed', (await sb.from('job_toekick_materials').delete().eq('project_id', P).eq('part_role', 'face')).error?.message ?? 'ok')
}
const { data: [bc14] } = await sb.from('cabinet_instances').select('id,toekick_overrides').eq('room_id', ROOM).eq('label', 'BC-14')
console.log('BC-14 kick teak', (await sb.from('cabinet_instances').update({ toekick_overrides: { ...(bc14.toekick_overrides ?? {}), face: TEAK18 } }).eq('id', bc14.id)).error?.message ?? 'ok')
const { data: mats } = await sb.from('materials').select('id,name').in('id', [TEAK18, '38d56943-7040-460c-af14-289c172ed5e7', 'd081b2a1-38a8-472c-a415-f179699a1347'])
const nm = id => mats.find(m => m.id === id)?.name ?? id?.slice(0, 8)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(6000)
  const cabs = (await page.evaluate(() => window.__canvasApi.getState())).cabinets
  for (const c of cabs.filter(c => /^BC-|^KICK/.test(c.label)).sort((a, b) => a.label.localeCompare(b.label))) {
    await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [c.label, c.dy]); await sleep(2500)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), c.label)
    const faces = [...new Set((rp?.toekick_parts ?? []).filter(k => /face/.test(k.part_key)).map(k => nm(k.material_id)))]
    const front = nm(rp?.face_zones?.[0]?.material_id)
    console.log(c.label.padEnd(7), 'kick face:', faces.join(', ') || '-', '| front:', rp?.face_zones?.length ? front : '-', '| warn', (rp?.warnings ?? []).length)
  }
} finally { await browser.close() }
