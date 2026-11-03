// RHK6478 Kitchen: island west edge -> real 60 waterfall (WF profile, mitre, built-up face + 300 return to the
// seating-side back panel like RHK6592 Flaxton). The first draw only set a `waterfall: true` flag the app ignores.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6', WF = 'ec8720a4-d679-414f-8936-03679e555932'
const { data: [top] } = await sb.from('benchtop_instances').select('id,segments').eq('room_id', R).eq('label', 'Island')
const segs = top.segments.map((s, i) => i === 4 ? { ...s, edge: { wall: false, profile_id: WF, waterfall_join: 'mitre', waterfall_return_mm: 300 } } : s)
const r = await sb.from('benchtop_instances').update({ segments: segs }).eq('id', top.id)
console.log(r.error?.message ?? 'top ok')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(6000)
  console.log('api', Object.keys(await page.evaluate(() => window.__canvasApi)).join(','))
  console.log('console errors', errs.slice(0, 5).join(' | '))
} finally { await browser.close() }
