// RHK6542 Study: join the display wall kicks TC-06 -> TC-08 (full length), then Set seams split.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94'
const STEP = process.env.STEP ?? 'join'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500) }
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  await open()
  if (STEP === 'join') {
    const p = api('joinKicks', 'TC-07')
    await sleep(2000)
    const txt = await page.evaluate(() => document.body.innerText.match(/This run mixes[^\n]*/)?.[0] ?? null)
    console.log('confirm:', txt)
    if (txt) await page.keyboard.press('Enter')
    console.log('join', JSON.stringify(await p)); await sleep(4000)
    await open()
  }
  if (STEP === 'resplit') {
    const st = await api('getState'); const k = st.cabinets.find(c => c.label === process.env.KICK)
    await api('updateCabinet', k.label, { dy: k.dy }); await sleep(3000)
  }
  const { data: asms } = await sb.from('cabinet_instances').select('id,label,dx,dz,pos_x,pos_y,rotation,kick_run_id').eq('room_id', R).eq('is_kick_assembly', true)
  for (const a of asms) {
    const rp = await api('getResolved', a.label)
    console.log('==', a.label, a.dx, a.dz, a.pos_x, a.pos_y, a.rotation, a.kick_run_id)
    console.log('  ', JSON.stringify(rp.toekick_parts.filter(p => p.part_key.startsWith('kick_')).map(p => [p.part_key, p.X, p.DY, p.grain_direction])))
  }
  const issues = await api('getIssues')
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0))
} finally { await browser.close() }
