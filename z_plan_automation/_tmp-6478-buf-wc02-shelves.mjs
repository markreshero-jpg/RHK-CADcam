// RHK6478 Buffet WC-02 (2026-11-18): after Bottom Type 'none' the fixed shelves re-spaced (floor dropped 33).
// Lock the sections 578 / 254 / 254 so the shelves sit where they were (578 / 865 / 1152) - mirrors 578 + 254 unchanged.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ID = 'b2a41d06-aebc-45af-ab76-8c4da4d2c7fc', R = '0df13af4-8a6f-438f-a10d-6a9b4754aa97'
const { data: c } = await sb.from('cabinet_instances').select('internal_grid,dz').eq('id', ID).single()
const ig = structuredClone(c.internal_grid)
;[578, 254, 254].forEach((s, i) => { ig.tree.children[i].size = s })
const { error } = await sb.from('cabinet_instances').update({ internal_grid: ig }).eq('id', ID); if (error) throw error
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
  await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [ID, c.dz]); await sleep(2000)
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const x of iss) for (const e of x.errors) console.log('ERROR', x.label, e.code, e.message)
} finally { await browser.close() }
const { data: ip } = await sb.from('internal_parts').select('part_type,y,sort_order').eq('cabinet_instance_id', ID).order('sort_order')
const { data: cp } = await sb.from('case_parts').select('part_key,dx,dy').eq('cabinet_instance_id', ID).order('part_key')
console.log(JSON.stringify(ip), JSON.stringify(cp))
process.exit(0)
