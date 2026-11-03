// Temp: RHK6586 robe (Mark 2026-11-01): WC-01 / WC-03 doors 300 higher (718 -> 1018), TV centred on the fixed panels.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd4fdad8f-bcbf-4c38-a6ad-b6e0cee7ca8d'
const chk = (l, r) => { console.log(l, r.error ? 'ERR ' + r.error.message : 'ok ' + (r.data?.length ?? '')); if (r.error) process.exit(1) }
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,face_grid,notes').eq('room_id', R).in('label', ['WC-01', 'WC-03'])
for (const c of cabs) chk(c.label, await sb.from('cabinet_instances').update({
  face_grid: { ...c.face_grid, rows: c.face_grid.rows.map(r => r.row_index === 0 ? { ...r, height: 1018 } : r) },
  notes: c.notes?.replace(/740-14\d\d/, '740-1758').replace(/1460-2328/, '1760-2328') }).eq('id', c.id).select('id'))
const TVZ = 1774, { data: tv } = await sb.from('room_fixtures').select('z').eq('id', 'dde3a7b1-' + '').limit(0)
const { data: tvs } = await sb.from('room_fixtures').select('id,z').eq('room_id', R).eq('kind', 'TV')
const dz = TVZ - tvs[0].z
chk('TV', await sb.from('room_fixtures').update({ z: TVZ }).eq('id', tvs[0].id).select('id'))
const { data: ann } = await sb.from('room_annotations').select('geom').eq('id', 'bbd2fc93-ab9a-467c-b23e-0bf77068fcee').single()
chk('TV note', await sb.from('room_annotations').update({ geom: { ...ann.geom, at: { ...ann.geom.at, y: ann.geom.at.y - dz } } }).eq('id', 'bbd2fc93-ab9a-467c-b23e-0bf77068fcee').select('id'))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
const sleep = ms => new Promise(r => setTimeout(r, ms))
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 90000 }); await sleep(4000)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.filter(c => /^WC-0[13]$/.test(c.label))) { await page.evaluate(([id, dz]) => window.__canvasApi.updateCabinet(id, { dz }), [c.id, c.dz]); await sleep(2000) }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const c of issues) for (const e of [...c.errors, ...c.warnings]) console.log(`  ${c.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
for (const c of cabs) { const { data } = await sb.from('face_zones').select('face_type,dy,y').eq('cabinet_instance_id', c.id); console.log(c.label, JSON.stringify(data)) }
