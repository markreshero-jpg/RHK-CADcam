// RHK6595: BC-01/02/03 fronts -> Sublime Teak via the cabinet door_face override (rank 5, beats the job colour grid,
// which overrode the zones' own door_colour_id). Zones keep the upper-door style (LX Abs Grain 18) for thickness.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11'
const LABELS = ['BC-01', 'BC-02', 'BC-03']
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,material_overrides').eq('room_id', ROOM).in('label', LABELS)
for (const c of cabs) console.log(c.label, (await sb.from('cabinet_instances').update({ material_overrides: { ...(c.material_overrides ?? {}), door_face: TEAK18 } }).eq('id', c.id)).error?.message ?? 'ok')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(6000)
  for (const l of LABELS) {
    const dy = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(c => c.label === l).dy
    await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [l, dy]); await sleep(3000)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, 'doors', JSON.stringify(rp.face_zones.map(z => [z.material_id?.slice(0, 8), z.DZ])), 'warn', JSON.stringify(rp.warnings.map(w => w.message)))
  }
} finally { await browser.close() }
