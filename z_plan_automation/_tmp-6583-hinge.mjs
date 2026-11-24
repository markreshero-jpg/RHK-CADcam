// Probe / set overhead hinge positions on WC-02 / WC-03 until clear of the adj shelf holes.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '33e64c8a-ebf9-498f-86d1-9879b1ccba0d'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cands = JSON.parse(process.argv[2])
const labels = process.argv[3] ? process.argv[3].split(',') : ['TC-02']
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  for (const h of cands) {
    for (const l of labels) {
      const c = (await sb.from('cabinet_instances').select('id,face_grid,dy').eq('room_id', R).eq('label', l).single()).data
      const fg = c.face_grid; fg.zones = fg.zones.map(z => ({ ...z, hinges: h }))
      await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id)
    }
    await page.reload({ waitUntil: 'networkidle2' }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(3000)
    for (const l of labels) { await page.evaluate((l) => window.__canvasApi.updateCabinet(l, { dz: 470 }), l); await sleep(2000) }
    const issues = await page.evaluate(() => window.__canvasApi.getIssues())
    const hit = issues.filter(ci => labels.includes(ci.label)).flatMap(ci => [...ci.errors, ...ci.warnings].map(e => `${ci.label} ${e.code}: ${e.message}`))
    console.log(JSON.stringify(h), hit.length ? hit.join('\n   ') : 'CLEAR')
  }
} finally { await browser.close() }
