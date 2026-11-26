// RHK6548 Hard Coffee post (2026-11-26): Back Kitchen TC-01 hinges, Back Counter kick join + grain match, issues for all rooms.
// node _tmp-6548-post.mjs "<hinges csv for TC-01>"
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ROOMS = { ws: '2bed2187-0b9c-4cf3-9e3e-5d29be5538a0', fc: '09786d9b-378e-42ed-9fc7-1aed4c7b21ab', bc: 'd3c04ade-ba07-4462-a40c-2a4bd1952d31', bk: 'e8b3c950-5be5-4e4a-9117-451395e9d2a1' }
const hinges = process.argv[2] ? process.argv[2].split(',').map(Number) : null

if (hinges) {
  const { data: cab } = await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', ROOMS.bk).eq('label', 'TC-01').single()
  const fg = { ...cab.face_grid, zones: cab.face_grid.zones.map(z => ({ ...z, hinges })) }
  console.log('hinges', hinges.join(','), (await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', cab.id)).error?.message ?? 'ok')
}
// Back Counter grain match (woodgrain drawer fronts, vertical)
{
  const { data: g } = await sb.from('grain_match_groups').select('id').eq('room_id', ROOMS.bc)
  if (!g.length) {
    const { data: ng } = await sb.from('grain_match_groups').insert({ room_id: ROOMS.bc, name: 'GM1', direction: 'vertical' }).select().single()
    await sb.from('cabinet_instances').update({ grain_match_group_id: ng.id }).eq('room_id', ROOMS.bc).eq('label', 'BC-02')
    console.log('GM1 on Back Counter BC-02')
  }
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  for (const [k, R] of Object.entries(ROOMS)) {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
    const api = (fn, ...a) => page.evaluate((fn, a) => window.__canvasApi[fn](...a), fn, a)
    if (k === 'bc') {
      const { data: cabs } = await sb.from('cabinet_instances').select('label').eq('room_id', R)
      if (!cabs.some(c => c.label.startsWith('KICK'))) { console.log('join', JSON.stringify(await api('joinKicks', 'BC-02'))); await sleep(5000) }
    }
    if (k === 'bk' && hinges) { console.log(JSON.stringify(await api('updateCabinet', 'TC-01', { dz: 490 }))); await sleep(5000) }
    const iss = await api('getIssues')
    for (const ci of iss) for (const e of [...ci.errors, ...ci.warnings]) console.log(k, ci.label, e.code, e.message)
    console.log(k, 'issues checked:', iss.length, 'cabinets')
    await page.close()
  }
} finally { await browser.close() }
process.exit(0)
