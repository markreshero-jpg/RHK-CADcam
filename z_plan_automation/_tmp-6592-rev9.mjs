// RHK6592 rev 9 (Mark 2026-11-05): delete TC-04 (PT panel between the open shelving and the broom cupboard),
// broom TC-05 + end TEPF TC-06 slide 16.5 left to butt TC-03, one kick run TC-02 -> TC-05 (602 -> 2992).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const BUT = '1c00eb19-09c1-41b8-8c7c-a6441ee0263d'
const del = await sb.from('cabinet_instances').delete().eq('room_id', BUT).eq('label', 'TC-04').select('id')
if (del.error) { console.error('delete TC-04', del.error.message); process.exit(1) }
console.log('deleted TC-04', del.data.length)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${BUT}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi'); await sleep(1500) }
  const api = async (fn, ...args) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, args]); console.log(fn, JSON.stringify(args), JSON.stringify(r)?.slice(0, 200)); await sleep(700); return r }
  await open()
  await api('updateCabinet', 'TC-06', { offset: 2992 })
  await api('updateCabinet', 'TC-05', { offset: 2542 })
  await open()
  await api('joinKicks', 'TC-05')
  await open()
  const s = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify(s.cabinets.filter(c => /^(TC|KICK 2)/.test(c.label)).map(c => [c.label, c.offset, c.dx, c.dy, c.dz])))
  for (const c of await page.evaluate(() => window.__canvasApi.getIssues())) if (c.errors.length || c.warnings.length) console.log(c.label, JSON.stringify([...c.errors, ...c.warnings].map(e => e.code + ' ' + e.message)))
  console.log('done')
} finally { await browser.close() }
