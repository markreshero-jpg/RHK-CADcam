// RHK6478 DS TV Unit: does a re-resolve (as an in-app edit does) keep a cabinet's position / rotation off the angled wall?
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '46c02367-c556-489e-9907-67785eb2cd87', L = process.argv[2] ?? 'BC-02'
const pos = async () => (await sb.from('cabinet_instances').select('label,pos_x,pos_y,rotation,dz').eq('room_id', R).eq('label', L).single()).data
console.log('before', JSON.stringify(await pos()))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(4000)
  const c = (await pos())
  console.log(JSON.stringify(await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [L, Number(c.dz)])))
  await sleep(2500)
} finally { await browser.close() }
console.log('after ', JSON.stringify(await pos()))
