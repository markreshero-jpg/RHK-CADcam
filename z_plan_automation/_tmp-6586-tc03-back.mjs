// RHK6586 2026-11-10 (Mark): Bed 1 robe TC-03 back drops to the top of the top fixed shelf
// (shelf y 1947 + 16.5 = 1963.5 in the cabinet frame, 2063.5 AFFL). Cabinet rule BKTOP.
// args: go | check
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd4fdad8f-bcbf-4c38-a6ad-b6e0cee7ca8d', ID = '0ed5459c-7e48-4d95-a6c4-a759d140ccaa'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const show = async () => {
  const { data: cp } = await sb.from('case_parts').select('part_key,dx,dy,dz,y').eq('cabinet_instance_id', ID)
  for (const p of cp) console.log(' case', p.part_key, p.dx, p.dy, p.dz, 'y', p.y)
  const { data: ops } = await sb.from('part_operations').select('source_part_key,pos_x,pos_y,diameter,parameters').eq('source_cabinet_id', ID).in('source_part_key', ['case_back', 'case_left_side', 'case_right_side'])
  const g = {}; for (const o of ops ?? []) { const k = o.source_part_key + ' ' + (o.parameters?.kind ?? ''); (g[k] ??= []).push(`${o.pos_x}/${o.pos_y}`) }
  for (const [k, v] of Object.entries(g)) console.log(' ops', k, v.length, v.slice(0, 40).join(' '))
}
if (process.argv[2] === 'check') await show()
if (process.argv[2] === 'go') {
  const { data: c } = await sb.from('cabinet_instances').select('label,rule_overrides,notes,dy').eq('id', ID).single()
  if (c.label !== 'TC-03' || c.dy !== 2294) throw new Error('TC-03 not as expected')
  console.log('before'); await show()
  const { error } = await sb.from('cabinet_instances').update({
    rule_overrides: { ...(c.rule_overrides ?? {}), BKTOP: 1963.5 },
    notes: (c.notes ?? '') + '. Back stops at the top of the top fixed shelf (BKTOP 1963.5, 2063.5 AFFL), pipe zone above open behind the loose false panel (Mark 2026-11-10)',
  }).eq('id', ID)
  if (error) throw error
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
  try {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
    await page.evaluate(([id, dz]) => window.__canvasApi.updateCabinet(id, { dz }), [ID, 682]); await sleep(4000)
    const issues = await page.evaluate(() => window.__canvasApi.getIssues())
    for (const c of issues.filter(c => c.label === 'TC-03')) for (const e of [...c.errors, ...c.warnings]) console.log(`  ${c.label} ${e.code}: ${e.message}`)
  } finally { await browser.close() }
  console.log('after'); await show()
}
