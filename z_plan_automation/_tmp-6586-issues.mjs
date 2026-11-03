// Temp: list resolver issues in every RHK6586 room.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: rooms } = await sb.from('rooms').select('id,name').eq('project_id', 'bada385f-41cf-411e-9536-d1e413e6d5ce')
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
const sleep = ms => new Promise(r => setTimeout(r, ms))
try {
  for (const rm of rooms) {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('dialog', d => d.dismiss())
    await page.goto(`http://localhost:3001/canvas/${rm.id}`, { waitUntil: 'networkidle2', timeout: 180000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 90000 }); await sleep(5000)
    const issues = await page.evaluate(() => window.__canvasApi.getIssues())
    console.log('==', rm.name)
    for (const c of issues) for (const e of [...c.errors.map(x => ({ ...x, l: 'E' })), ...c.warnings.map(x => ({ ...x, l: 'W' }))]) console.log(`  ${e.l} ${c.label} ${e.code}: ${e.message}`)
    await page.close()
  }
} finally { await browser.close() }
