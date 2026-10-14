// Resolver issue report for a room: re-resolves every cabinet through the real
// pipeline (via window.__canvasApi.getIssues) and prints errors/warnings.
//
//   node z_plan_automation/resolver-report.mjs <roomId>
//
// Exit codes: 0 clean, 2 warnings only, 3 any errors.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.DEV_PORT ?? '3001'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const die = msg => { console.error('ERROR:', msg); process.exit(1) }

const roomId = process.argv[2]
if (!roomId) die('usage: node z_plan_automation/resolver-report.mjs <roomId>')

const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
// No anonymous DB access (z_access_control) — sign in as the automation account.
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.error("automation sign-in failed (AUTOMATION_EMAIL/PASSWORD in .env.local):", error.message); process.exit(1) } }
const { data: room } = await sb.from('rooms').select('id,name').eq('id', roomId).maybeSingle()
if (!room) die(`room not found: ${roomId}`)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run', '--disable-gpu'] })
let issues
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:${PORT}/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction('!!window.__canvasApi?.getIssues', { timeout: 30000 })
  await sleep(800)
  issues = await page.evaluate(() => window.__canvasApi.getIssues())
} finally {
  await browser.close()
}

let errTotal = 0, warnTotal = 0
console.log(`\nRESOLVER REPORT — ${room.name} (${room.id})\n`)
for (const c of issues) {
  errTotal += c.errors.length
  warnTotal += c.warnings.length
  const flag = c.errors.length ? 'ERROR' : c.warnings.length ? 'WARN ' : 'OK   '
  console.log(`${flag} ${c.label}  ${c.class}  ${c.dims}`)
  for (const e of c.errors) console.log(`        E ${e.code}: ${e.message}${e.part ? ` [${e.part}]` : ''}`)
  for (const w of c.warnings) console.log(`        W ${w.code}: ${w.message}${w.part ? ` [${w.part}]` : ''}`)
}
console.log(`\n${issues.length} cabinets — ${errTotal} error(s), ${warnTotal} warning(s)`)
process.exit(errTotal ? 3 : warnTotal ? 2 : 0)
