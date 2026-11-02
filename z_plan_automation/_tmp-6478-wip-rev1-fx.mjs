// RHK6478 WIP rev 1: put the Bosch D/W back in its bay (1722-2320, 20 off the wall face) and re-link it to the BC-07 front.
import puppeteer from 'puppeteer-core'
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae', DW_FX = '9f8731a7-43d4-4a5f-bbc2-ac018fa42640'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  await page.evaluate(id => window.__canvasApi.updateFixture(id, { x: 2320, y: 2182, rotation: 180 }), DW_FX)
  await sleep(4000)
  const s = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify(s.fixtures.map(f => [f.name.slice(0, 20), f.x, f.y, f.cabinet, f.clash])))
} finally { await browser.close() }
// then link it to the BC-07 front (floor mount never auto-links): centre (2021, 1907) from BC-07 origin (2321, 2202), x (-1,0), perp (0,-1)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { error } = await sb.from('room_fixtures').update({ cabinet_id: '01a9150d-556c-48be-a8dc-eebb05410b70', link_x: 300, link_z: 295, link_rot: 0, x: 2320, y: 2182, rotation: 180 }).eq('id', DW_FX)
if (error) throw error
const b2 = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await b2.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(6000)
  const s = await page.evaluate(() => window.__canvasApi.getState())
  console.log('linked', JSON.stringify(s.fixtures.map(f => [f.name.slice(0, 20), f.x, f.y, f.cabinet, f.clash])))
} finally { await b2.close() }
