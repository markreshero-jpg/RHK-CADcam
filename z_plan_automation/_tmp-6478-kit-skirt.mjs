// RHK6478 Kitchen: island waterfall skirt (Mark 2026-11-04, markup sheet 3 Elev 7): 20 stone flush with the back
// apron, floor to the apron underside, quarter-ellipse from 400 on the floor to 2100 at the apron, from the west leg.
// Then screenshots of the Wall 5 back elevation + 3D.  node _tmp-6478-kit-skirt.mjs [shotsDir]
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6', OUT = process.argv[2] ?? '.'
const { data: [top] } = await sb.from('benchtop_instances').select('id,segments,notes').eq('room_id', R).eq('label', 'Island')
// edge 4 runs (1230, 3150) -> (1230, 1750): its start is the back (seating) corner, next to edge 3 (back apron)
const segs = top.segments.map((s, i) => i === 4 ? { ...s, edge: { ...s.edge, waterfall_skirt: { side: 'start', foot_mm: 400, reach_mm: 2100 } } } : s)
const notes = top.notes.includes('SKIRT') ? top.notes : top.notes + ' 20 stone SKIRT flush with the back apron at the waterfall end, floor to the apron underside, curving from 400 on the floor to 2100 at the apron (markup sheet 3).'
const r = await sb.from('benchtop_instances').update({ segments: segs, notes }).eq('id', top.id)
console.log(r.error?.message ?? 'skirt set')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 }); await sleep(4000)
  const click = t => page.evaluate(v => { const b = [...document.querySelectorAll('button')].filter(e => e.textContent.trim() === v && e.offsetParent); b.at(-1)?.click(); return b.length }, t)
  console.log('Elevation', await click('Elevation')); await sleep(4000)
  console.log('Wall 5', await click('Wall 5')); await sleep(3000)
  const btns = await page.evaluate(() => [...document.querySelectorAll('button')].filter(e => e.offsetParent).map(e => e.textContent.trim()).filter(t => t && t.length < 20))
  console.log('buttons', JSON.stringify(btns))
  await page.screenshot({ path: `${OUT}/kit_w5_face.png` })
  for (const t of ['back']) if (await click(t)) { console.log('clicked', t); break }
  await sleep(3000); await page.screenshot({ path: `${OUT}/kit_w5_back.png` })
  console.log('3D', await click('3D')); await sleep(8000); await page.screenshot({ path: `${OUT}/kit_3d.png` })
  console.log('errors', errs.slice(0, 5).join(' | '))
} finally { await browser.close() }
