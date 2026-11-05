// RHK6592 rev 12b (Mark 2026-11-05): KICK 3 sub front + back REMOVED (part_hide_views in all 3 views = not made);
// rev 12 wrongly used hidden_parts, which doesn't remove anything.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const BUT = '1c00eb19-09c1-41b8-8c7c-a6441ee0263d'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' })
try {
  const p = await b.newPage(); await p.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => { await p.goto(`http://localhost:3001/canvas/${BUT}`, { waitUntil: 'networkidle2', timeout: 90000 }); await p.waitForFunction('!!window.__canvasApi'); await sleep(1500) }
  const tk = () => p.evaluate(async () => ((await window.__canvasApi.getResolved('KICK 3'))?.toekick_parts ?? []).map(q => `tk_${q.part_key}_${q.sort_order}`))
  await open()
  const ids = await tk(); console.log('parts', ids)
  const row = (await sb.from('cabinet_instances').select('id,part_hide_views').eq('room_id', BUT).eq('label', 'KICK 3').single()).data
  const phv = { ...(row.part_hide_views ?? {}) }
  for (const id of ids) if (!id.startsWith('tk_kick_front_face_')) phv[id] = ['plan', 'elevation', '3d']
  const r = await sb.from('cabinet_instances').update({ part_hide_views: phv, hidden_parts: [] }).eq('id', row.id)
  if (r.error) throw new Error(r.error.message)
  console.log('removed', JSON.stringify(phv))
  await open()
  await p.evaluate(() => window.__canvasApi.updateCabinet('KICK 3', { dy: 110 })); await sleep(1500)
  for (const x of await p.evaluate(() => window.__canvasApi.getIssues())) if (x.errors.length || x.warnings.length) console.log(x.label, JSON.stringify([...x.errors, ...x.warnings].map(e => e.code)))
  console.log('done')
} finally { await b.close() }
