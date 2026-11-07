// RHK6595 WC-10: WF-L wall filler each side (18 Sublime Teak), WC-10 890 -> 854 between them.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const api = (page, fn, ...a) => page.evaluate((fn, a) => window.__canvasApi[fn](...a), fn, a)
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(3000)
  let st = await api(page, 'getState')
  const w4 = st.walls.find(w => w.name === 'Wall 4')
  const before = st.cabinets.filter(c => c.wall_id === w4.id).map(c => c.label)
  console.log('wall 4 before', before.join(','))
  if (!st.cabinets.some(c => c.wall_id === w4.id && c.cabinet_definition_id === 'cf3eea4b-dd70-4f69-bb01-742a6732b1d0')) {
    console.log('WC-10', JSON.stringify(await api(page, 'updateCabinet', 'WC-10', { dx: 854, offset: 18 })))
    await sleep(2500)
    for (const offset of [0, 872]) {
      const r = await api(page, 'placeCabinet', { def: 'WF-L', wall: w4.id, offset, dx: 18 })
      console.log('place', offset, JSON.stringify(r).slice(0, 200)); await sleep(2500)
    }
  }
  st = await api(page, 'getState')
  const wfl = st.cabinets.filter(c => c.wall_id === w4.id && c.cabinet_definition_id === 'cf3eea4b-dd70-4f69-bb01-742a6732b1d0')
  const wc10 = st.cabinets.find(c => c.label === 'WC-10')
  for (const c of wfl) {
    await sb.from('cabinet_instances').update({ material_overrides: { exposed: TEAK18 }, pos_z: wc10.pos_z }).eq('id', c.id)
    await api(page, 'updateCabinet', c.id, { dy: wc10.dy, dz: wc10.dz }); await sleep(2500)
  }
  st = await api(page, 'getState')
  for (const c of st.cabinets.filter(c => c.wall_id === w4.id)) console.log(c.label, c.dx, c.dy, c.dz, 'pos', c.pos_x, c.pos_y, c.pos_z, c.offset)
  for (const c of st.cabinets.filter(c => c.wall_id === w4.id && c.cabinet_definition_id === 'cf3eea4b-dd70-4f69-bb01-742a6732b1d0')) {
    const rp = await api(page, 'getResolved', c.label)
    const cp = rp?.custom_parts?.[0]
    console.log(c.label, 'part', cp?.dx, cp?.dy, cp?.dz, cp?.orientation, 'outline', JSON.stringify(cp?.outline), 'mat', cp?.material_id, 'warn', JSON.stringify(rp?.warnings?.map(w => w.message)))
  }
} finally { await browser.close() }
