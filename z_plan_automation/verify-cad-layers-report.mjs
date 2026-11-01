// CAD layers L4 report check (z_cad_layers): three plan texts in the test room — General
// (prints), Construction set to don't print, Site notes switched off — then the Plan View
// report preview and its downloaded PDF should hold only the General one, and the canvas
// should still show the don't-print one. Restores the layers and cleans up after itself.
//   node z_plan_automation/verify-cad-layers-report.mjs <outDir>
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

const OUT = path.resolve(process.argv[2] ?? '.')
const ROOM = process.env.ROOM_ID ?? '26f8c90d-f35e-46e3-ae04-10a6cf7e1b48'   // RHK1234 Kitchen Test Room
const TAG = 'ZZ_LAYERTEST'
const TEXTS = { general: 'ZZPRINTGENERAL', noprint: 'ZZNOPRINTCONSTRUCTION', off: 'ZZOFFSITENOTES' }
const sleep = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.log('sign-in failed', error.message); process.exit(1) } }

const cleanup = async () => {
  const { data } = await sb.from('room_annotations').delete().eq('room_id', ROOM).eq('style->>block', TAG).select('id')
  console.log('cleanup: removed', data?.length ?? 0, 'test texts')
}

const { data: room } = await sb.from('rooms').select('project_id').eq('id', ROOM).single()
const { data: layers } = await sb.from('job_cad_layers').select('*').eq('project_id', room.project_id)
const construction = layers?.find(l => l.name === 'Construction')
const site = layers?.find(l => l.name === 'Site notes')
if (!construction || !site) { console.log('job layers missing — open the room once first'); process.exit(1) }
const saved = { construction: { print: construction.print, visible: construction.visible }, site: { print: site.print, visible: site.visible } }

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 } })
let pass = true
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) pass = false }
try {
  await sb.from('job_cad_layers').update({ print: false, visible: true }).eq('id', construction.id)
  await sb.from('job_cad_layers').update({ print: true, visible: false }).eq('id', site.id)
  await cleanup()
  const text = (y, s, layer) => ({ room_id: ROOM, view: 'plan', kind: 'text', geom: { at: { x: 400, y } }, text: s,
    style: { size: 80, block: TAG }, sort_order: 900, cad_layer_id: layer })
  const { error: insErr } = await sb.from('room_annotations').insert([
    text(400, TEXTS.general, null), text(700, TEXTS.noprint, construction.id), text(1000, TEXTS.off, site.id)])
  if (insErr) throw insErr

  const page = await browser.newPage()
  const cdp = await page.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT })
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message.slice(0, 200)))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(4000)
  const textsIn = sel => page.evaluate((sel, want) => {
    const all = [...document.querySelectorAll(sel)].map(t => t.textContent).join(' ')
    return Object.fromEntries(Object.entries(want).map(([k, s]) => [k, all.includes(s)]))
  }, sel, TEXTS)

  const canvas = await textsIn('g[data-layer="annotations"] text')
  console.log('canvas:', JSON.stringify(canvas))
  check('canvas shows General', canvas.general)
  check('canvas shows the don\'t-print layer', canvas.noprint)
  check('canvas hides the switched-off layer', !canvas.off)

  const clickText = async (t, sel = 'button, div, span, li, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].reverse().find(e => e.textContent.trim() === t && e.offsetParent !== null); if (el) el.click(); return !!el }, t, sel)
    if (!ok) throw new Error('not found: ' + t)
    await sleep(800)
  }
  await clickText('Reports'); await clickText('Room Reports…')
  await page.click('[data-tour="report-plan_view_v2"]')
  await page.waitForFunction(() => { const b = document.querySelector('[data-tour="plan-download"]'); return b && !b.disabled }, { timeout: 120000 })
  await sleep(2000)
  const report = await textsIn('[role="dialog"] svg text, .fixed svg text')
  console.log('report preview:', JSON.stringify(report))
  check('report preview shows General', report.general)
  check('report preview leaves out the don\'t-print layer', !report.noprint)
  check('report preview leaves out the switched-off layer', !report.off)
  await page.screenshot({ path: path.join(OUT, 'cl-report-preview.png') })

  const t0 = Date.now()
  await page.click('[data-tour="plan-download"]')
  let pdf = null
  for (let i = 0; i < 60 && !pdf; i++) { await sleep(1000); pdf = fs.readdirSync(OUT).find(f => f.endsWith('.pdf') && fs.statSync(path.join(OUT, f)).mtimeMs >= t0 - 1000) }
  if (!pdf) throw new Error('no PDF downloaded')
  await sleep(1000)
  const py = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs/Python/Python312/python.exe')].find(p => p && fs.existsSync(p)) ?? 'python'
  const pdfText = execFileSync(py, ['-I', '-c', 'import sys,pypdf;print(" ".join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))', path.join(OUT, pdf)], { encoding: 'utf8' })
  const inPdf = Object.fromEntries(Object.entries(TEXTS).map(([k, s]) => [k, pdfText.replace(/\s+/g, '').includes(s)]))
  console.log(`PDF ${pdf}:`, JSON.stringify(inPdf))
  check('PDF shows General', inPdf.general)
  check('PDF leaves out the don\'t-print layer', !inPdf.noprint)
  check('PDF leaves out the switched-off layer', !inPdf.off)
} catch (e) {
  console.log('FAILED', e.message); pass = false
} finally {
  await sb.from('job_cad_layers').update(saved.construction).eq('id', construction.id)
  await sb.from('job_cad_layers').update(saved.site).eq('id', site.id)
  await cleanup()
  await browser.close()
  console.log(pass ? 'ALL PASS' : 'SOME CHECKS FAILED')
}
