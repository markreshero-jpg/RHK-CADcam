// RHK6478 US Hallway Linen: 4 hinges per door + height split 3 under the fixed shelf top (splitSuggestions rule).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b6377e60-bed3-4e5c-af80-7ea320db6ff5'
const H = [2474, 1880.5, 1000, 100]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500) }
  await open()
  const cuts = {}
  for (const l of ['TC-02', 'TC-03']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    const fs_ = rp.internal_parts.filter(p => p.part_type === 'fixed_shelf')
    cuts[l] = fs_.map(p => Math.round((p.Y + p.DZ - 3) * 10) / 10)
    console.log(l, 'fixed shelf Y/DZ', JSON.stringify(fs_.map(p => [p.Y, p.DZ])), 'cut', cuts[l])
  }
  const { data: cabs } = await sb.from('cabinet_instances').select('id,label,face_grid').eq('room_id', R).in('label', ['TC-02', 'TC-03'])
  for (const c of cabs) {
    const fg = c.face_grid; fg.zones = fg.zones.map(z => ({ ...z, hinges: H }))
    const { error } = await sb.from('cabinet_instances').update({ face_grid: fg, split: { at: cuts[c.label] } }).eq('id', c.id)
    console.log(c.label, error?.message ?? 'saved')
  }
  await open()
  for (const l of ['TC-02', 'TC-03']) {
    const c = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(x => x.label === l)
    await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [l, c.dz]); await sleep(2500)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, 'hinges', JSON.stringify(rp.hinge_instances.map(h => [h.col_index, h.y_position_mm])))
  }
  const { data: after } = await sb.from('cabinet_instances').select('id,label,split').eq('room_id', R).in('label', ['TC-02', 'TC-03'])
  for (const c of after) {
    const { data: parts } = await sb.from('case_parts').select('part_key').eq('cabinet_instance_id', c.id)
    console.log(c.label, JSON.stringify(c.split), (parts ?? []).map(p => p.part_key).filter(k => /side|back/.test(k)).join(' '))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const c of issues) for (const e of [...c.errors, ...c.warnings]) console.log(`  ${c.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
