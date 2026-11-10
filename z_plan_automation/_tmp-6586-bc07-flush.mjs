// RHK6586 2026-11-11 (Mark): Bed 1 BC-07 angle panel comes out in depth to the front line and
// is bevelled flush with the shelf / top / bottom front edges (footprint.joins angle|front = flush).
// args: go | check
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd4fdad8f-bcbf-4c38-a6ad-b6e0cee7ca8d', ID = 'd4ca92ab-1c6a-477f-a90a-0e06f258dd2e'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const show = async () => {
  const { data: cp } = await sb.from('case_parts').select('*').eq('cabinet_instance_id', ID)
  for (const p of cp) console.log(' case', p.part_key, 'dx', +p.dx.toFixed(1), 'dy', +p.dy.toFixed(1), 'xyz', +p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1), p.bevel_lo ?? '', p.bevel_hi ?? '', p.edging ? JSON.stringify(p.edging) : '')
  const { data: ops } = await sb.from('part_operations').select('source_part_key,pos_x,pos_y').eq('source_cabinet_id', ID).like('source_part_key', '%angle%')
  console.log(' angle ops', (ops ?? []).map(o => `${o.pos_x}/${o.pos_y}`).join(' '))
}
if (process.argv[2] === 'check') await show()
if (process.argv[2] === 'go') {
  const { data: c } = await sb.from('cabinet_instances').select('label,footprint,notes,dz').eq('id', ID).single()
  if (c.label !== 'BC-07' || !c.footprint?.segments?.some(s => s.edge?.id === 'angle')) throw new Error('BC-07 not as expected')
  console.log('before'); await show()
  const { error } = await sb.from('cabinet_instances').update({
    footprint: { ...c.footprint, joins: { ...(c.footprint.joins ?? {}), 'angle|front': 'flush' } },
    notes: (c.notes ?? '') + '. Angle panel out to the front line, front end bevelled flush with the shelf / top / bottom fronts (Mark 2026-11-11)',
  }).eq('id', ID)
  if (error) throw error
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
  try {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
    await page.evaluate(([id, dz]) => window.__canvasApi.updateCabinet(id, { dz }), [ID, c.dz]); await sleep(4000)
    const issues = await page.evaluate(() => window.__canvasApi.getIssues())
    for (const x of issues.filter(x => x.label === 'BC-07')) for (const e of [...x.errors, ...x.warnings]) console.log(`  ${x.label} ${e.code}: ${e.message}`)
  } finally { await browser.close() }
  console.log('after'); await show()
}
