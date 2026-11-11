// RHK6339 J05: debug BC-01 stale parts — re-resolve BC-01 and capture console errors + part timestamps.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'ab417075-b6e2-4189-93c5-c281e1f05f9b'
const ts = async () => { const { data: c } = await sb.from('cabinet_instances').select('id,label').eq('room_id', R).order('label'); for (const x of c) { const { data: p } = await sb.from('case_parts').select('part_key,y,created_at').eq('cabinet_instance_id', x.id).eq('part_key', 'left_side'); console.log(x.label, JSON.stringify(p)) } }
await ts()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const logs = []; page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 300)) })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  logs.length = 0
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('BC-01', { dz: 676 })))); await sleep(5000)
  console.log(logs.filter(l => !/406|400/.test(l)).join('\n'))
} finally { await browser.close() }
await ts()
