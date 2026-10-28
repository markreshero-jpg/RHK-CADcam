// CAD layers L1–L3 (z_cad_layers): seed three plan boxes (General / Plumbing /
// Construction) in the test room, open it, F7, check ByLayer colours, turn Plumbing off
// in the CAD panel, open the layer manager. Screenshots to argv[2]. Cleans up after itself.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? '26f8c90d-f35e-46e3-ae04-10a6cf7e1b48'   // RHK1234 Kitchen Test Room
const TAG = 'ZZ_LAYERTEST'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('saved', name) }

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.log('sign-in failed', error.message); process.exit(1) } }

const cleanup = async () => {
  const { data } = await sb.from('room_annotations').delete().eq('room_id', ROOM).eq('style->>block', TAG).select('id')
  console.log('cleanup: removed', data?.length ?? 0, 'test boxes')
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
let plumbing = null
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)) })
  const open = async () => {
    await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
    await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
    await sleep(4000)
  }
  await open()   // first open copies the shop list into the job

  const { data: room } = await sb.from('rooms').select('project_id').eq('id', ROOM).single()
  const { data: layers } = await sb.from('job_cad_layers').select('*').eq('project_id', room.project_id).order('sort_order')
  console.log('job layers:', layers.map(l => `${l.name}${l.is_default ? '*' : ''} ${l.color}${l.print ? '' : ' noprint'}`).join(' | '))
  plumbing = layers.find(l => l.name === 'Plumbing')
  const construction = layers.find(l => l.name === 'Construction')
  if (!plumbing || !construction) throw new Error('shop list not copied')

  await cleanup()
  const box = (x, layer) => ({ room_id: ROOM, view: 'plan', kind: 'rect', geom: { a: { x, y: 300 }, b: { x: x + 500, y: 700 }, rot: 0 },
    style: { weight: 1, block: TAG }, sort_order: 900, cad_layer_id: layer })
  const { error: insErr } = await sb.from('room_annotations').insert([box(300, null), box(1000, plumbing.id), box(1700, construction.id)])
  if (insErr) throw insErr

  await open()
  await page.keyboard.press('F7')
  await sleep(1500)
  const strokes = () => page.evaluate(() => [...document.querySelectorAll('g[data-layer="annotations"] rect')]
    .map(r => r.getAttribute('stroke')).filter(s => s && s !== 'transparent' && s !== 'none'))
  console.log('box strokes (CAD on):', JSON.stringify(await strokes()))
  await shot(page, 'cl-1-cad-on.png')

  // Plumbing off from the CAD panel's layer list.
  const clicked = await page.evaluate(() => { const b = document.querySelector('[data-cad-layer="Plumbing"] button'); b?.click(); return !!b })
  await sleep(1200)
  console.log('eye clicked', clicked, '→ strokes:', JSON.stringify(await strokes()))
  const { data: pl } = await sb.from('job_cad_layers').select('visible').eq('id', plumbing.id).single()
  console.log('Plumbing visible in DB:', pl.visible)
  await shot(page, 'cl-2-plumbing-off.png')

  console.log('layer picker options:', await page.evaluate(() => [...(document.querySelector('[data-cad-layer-pick]')?.options ?? [])].map(o => o.text).join(' | ')))

  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Manage layers…')?.click())
  await sleep(800)
  console.log('manager open:', await page.evaluate(() => !!document.querySelector('[data-cad-layer-manager]')))
  await shot(page, 'cl-3-manager.png')
} catch (e) {
  console.log('FAILED', e.message)
} finally {
  if (plumbing) await sb.from('job_cad_layers').update({ visible: true }).eq('id', plumbing.id)
  await cleanup()
  await browser.close()
}
