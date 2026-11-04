// RHK6478 Study (Mark 2026-11-05): desk top WC-21 -> base class (BUP def), label BC-11, so the shop drawings stop
// drawing it with the overheads. Custom parts, ops + pos_z 697.5 kept.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const bup = chk('bup', await sb.from('cabinet_definitions').select('id,rule_overrides').eq('name', 'BUP'))[0]
console.log('BUP rules', JSON.stringify(bup.rule_overrides))
const c = chk('c', await sb.from('cabinet_instances').select('id,label,rule_overrides').eq('room_id', R).in('label', ['WC-21', 'BC-11']))[0]
chk('upd', await sb.from('cabinet_instances').update({ cabinet_definition_id: bup.id, assembly_class: 'base', label: 'BC-11', pos_z: 697.5 }).eq('id', c.id))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(1500); return r }
try {
  await open()
  console.log(JSON.stringify(await api('updateCabinet', 'BC-11', { dz: 600 })))
  await open()
  const st = await api('getState')
  console.log(JSON.stringify(st.cabinets.filter(c => c.label === 'BC-11')))
  const rp = await api('getResolved', 'BC-11')
  console.log('parts', (rp.custom_parts ?? []).length, JSON.stringify(rp.case_parts?.map(p => p.part_key)))
  console.log(JSON.stringify(chk('db', await sb.from('cabinet_instances').select('label,pos_z,dy,dz,has_toekick').eq('id', c.id))))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
