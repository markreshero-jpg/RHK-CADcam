// RHK6478 Kitchen: TC-07 pocket unit + WC-01 over it full depth 630 (Mark 2026-11-04). The deep shadowline WC-08 now runs
// 0-1666 (to the pocket unit's carcass line, right return 290 to the 400 overheads), WC-09 1666-3648 over the TEPF.
// Microwave moved to the front of the deeper unit (20 back from the carcass front).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6'
const up = async (l, p) => chk(l, await sb.from('cabinet_instances').update(p).eq('room_id', R).eq('label', l))
await up('WC-08', { notes: '18 2pac shadowline over the oven tower + pocket unit (both 630), 0-1666, 2672-2690, right return 290 (steps to 400)' })
await up('WC-09', { notes: '18 2pac shadowline over the cooktop overheads, 1666-3648, runs over the panels, 2672-2690' })
await up('TC-07', { notes: '# 14 POCKET DOOR unit on the bench (920-1940), full depth 630, Timbergrain inside, fixed shelf top 1550 AFF for the microwave (model TBC). Pocket door hardware TBC' })
await up('WC-01', { notes: '# 13 overhead over the pocket unit 1940-2672, full depth 630, 1 adj' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]); await sleep(2000); return r }
  for (const [l, p] of [['TC-07', { dz: 630 }], ['WC-01', { dz: 630 }], ['WC-08', { dx: 1666 }], ['WC-09', { offset: 1666, dx: 1982 }]]) console.log(l, JSON.stringify(await api('updateCabinet', l, p)))
  console.log('mw', JSON.stringify(await api('updateFixture', '57d64ac6-c25e-4ae3-9290-c46616c89bb1', { x: 906, y: 630 - 20 - 400 })))
  const st = await api('getState')
  for (const c of st.cabinets.filter(c => c.wall === 'Wall 2' && /WC-0[1-9]|TC-07/.test(c.label))) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  const mw = st.fixtures.find(f => /Microwave/.test(f.name)); console.log('mw', JSON.stringify(mw))
  for (const l of ['WC-08', 'WC-09']) { const r = await api('getResolved', l); console.log(l, JSON.stringify((r?.case_parts ?? []).filter(p => String(p.part_key).startsWith('bh:')).map(p => [p.part_key, p.DX, p.DY]))) }
  console.log('issues', JSON.stringify((await api('getIssues')).filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
