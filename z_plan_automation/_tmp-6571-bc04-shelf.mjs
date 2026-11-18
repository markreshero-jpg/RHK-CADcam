// RHK6571 BC-04 (1785 blind-corner sink cabinet): adjustable shelf out (Mark 2026-11-18). Then plan screenshot for the El B overall.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const c = chk('q', await sb.from('cabinet_instances').select('id,internal_grid').eq('room_id', R).eq('label', 'BC-04').single())
chk('u', await sb.from('cabinet_instances').update({ internal_grid: { ...c.internal_grid, tree: { type: 'open', fittings: [] } } }).eq('id', c.id))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 3 })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(5000)
  await page.evaluate(() => window.__canvasApi.updateCabinet('BC-04', { dy: 880 })); await sleep(3000)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('BC-04'))
  console.log('BC-04 internals', JSON.stringify((rp.internal_parts ?? []).map(p => p.part_type)))
  await page.screenshot({ path: process.argv[2] })
} finally { await browser.close() }
