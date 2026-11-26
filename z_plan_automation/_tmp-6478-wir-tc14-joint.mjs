// RHK6478 Master WIR TC-14 (Mark 2026-11-26): top-row dividers int_divider_2 / _3 - no CNC holes at the bottom
// (biscuit into the shelf by hand); top end keeps the 5mm holes (screwed down from the top). Label comments.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'e58340a6-4b68-4543-a1ca-a686b515a647'
const { data: c, error } = await sb.from('cabinet_instances').select('id,dz,carcase_joints,part_comments').eq('room_id', R).eq('label', 'TC-14').single()
if (error) throw error
console.log('before', JSON.stringify(c.carcase_joints), JSON.stringify(c.part_comments))
const note = 'TOP ROW DIVIDER - screw down through the top, biscuit into the shelf below by hand'
const { error: e } = await sb.from('cabinet_instances').update({
  carcase_joints: { ...(c.carcase_joints ?? {}), 'int_divider_2:bottom': null, 'int_divider_3:bottom': null },
  part_comments: { ...(c.part_comments ?? {}), int_divider_2: note, int_divider_3: note },
}).eq('id', c.id)
if (e) throw e
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(6000)
  await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [c.id, c.dz]); await sleep(5000)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('TC-14'))
  for (const s of rp.seam_joints.filter(s => /int_divider_[23]/.test(s.seam_key) || /int_divider_[23]/.test(s.part_b_key))) console.log('seam', s.seam_key, s.part_b_key, s.joint_type_name, s.source)
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const x of iss) for (const e of [...x.errors, ...x.warnings]) console.log('ISSUE', x.label, e.code, e.message)
} finally { await browser.close() }
process.exit(0)
