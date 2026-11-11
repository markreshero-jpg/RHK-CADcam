// RHK6339 J07: placeCabinet rounded BC-02 / BC-03 to 1009 -> back to 1008.5 at 960 / 1968.5, re-resolve.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
const show = async () => console.log(JSON.stringify((await sb.from('cabinet_instances').select('label,pos_x,pos_y,dx').eq('room_id', R).order('label')).data))
await show()
for (const [l, y] of [['BC-02', 960], ['BC-03', 1968.5]]) console.log(l, (await sb.from('cabinet_instances').update({ dx: 1008.5, pos_y: y }).eq('room_id', R).eq('label', l)).error?.message ?? 'ok')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  for (const l of ['BC-02', 'BC-03', 'KICK 1']) { console.log(l, JSON.stringify(await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 286 }), l))); await sleep(3000) }
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', ci.label, e.code, e.message)
} finally { await browser.close() }
await show()
