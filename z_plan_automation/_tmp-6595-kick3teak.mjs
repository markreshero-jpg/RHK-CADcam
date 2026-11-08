// RHK6595: KICK 3 (island back row run) face -> Sublime Teak 18 to match BC-01/02/03; re-resolve KICK 1-3.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11'
const { data: [k3] } = await sb.from('cabinet_instances').select('id,toekick_overrides').eq('room_id', ROOM).eq('label', 'KICK 3').eq('is_kick_assembly', true)
console.log('KICK 3 teak', (await sb.from('cabinet_instances').update({ toekick_overrides: { ...(k3.toekick_overrides ?? {}), face: TEAK18 } }).eq('id', k3.id)).error?.message ?? 'ok')
const { data: mats } = await sb.from('materials').select('id,name').in('id', [TEAK18, '38d56943-7040-460c-af14-289c172ed5e7'])
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(6000)
  const cabs = (await page.evaluate(() => window.__canvasApi.getState())).cabinets
  for (const l of ['KICK 1', 'KICK 2', 'KICK 3']) {
    const c = cabs.find(x => x.label === l)
    await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [l, c.dy]); await sleep(3000)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    const faces = [...new Set((rp?.toekick_parts ?? []).filter(k => /face/.test(k.part_key)).map(k => `${k.part_key} ${Math.round(k.DY ?? k.dy)} ${mats.find(m => m.id === k.material_id)?.name ?? k.material_id}`))]
    console.log(l, JSON.stringify(faces), 'parts', (rp?.toekick_parts ?? []).length, 'warn', JSON.stringify((rp?.warnings ?? []).map(w => w.message)))
  }
} finally { await browser.close() }
