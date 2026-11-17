// RHK6468 pre-nest fixes 2 (Mark 2026-11-17, before the all-rooms optimiser run): WIR Blonde Oak drawer banks
// grain matched (one vertical group per stack); every bulkhead gets the +10 ceiling scribe (h_adjust 10); re-resolve.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const P = '21601535-e1c8-4087-96b8-bb2506b96c3d', WIR = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const groups = chk('g', await sb.from('grain_match_groups').select('id,name').eq('room_id', WIR))
let n = groups.reduce((m, g) => Math.max(m, Number(g.name.replace(/\D/g, '')) || 0), 0)
for (const l of ['BC-02', 'BC-03', 'BC-08']) {
  const c = chk(l, await sb.from('cabinet_instances').select('id,grain_match_group_id').eq('room_id', WIR).eq('label', l).single())
  if (c.grain_match_group_id) { console.log(l, 'already grouped'); continue }
  const g = chk('gi', await sb.from('grain_match_groups').insert({ room_id: WIR, name: `GM${++n}`, direction: 'vertical' }).select('id,name').single())
  chk('cu', await sb.from('cabinet_instances').update({ grain_match_group_id: g.id }).eq('id', c.id)); console.log(l, '->', g.name)
}
const rooms = chk('r', await sb.from('rooms').select('id,name').eq('project_id', P))
const bhs = chk('bh', await sb.from('cabinet_instances').select('id,label,room_id,bulkhead,dz').in('room_id', rooms.map(r => r.id)).not('bulkhead', 'is', null))
const todo = new Map()
for (const c of bhs) {
  if (c.bulkhead.kind === 'shadowline' || c.bulkhead.h_adjust) continue
  chk('u', await sb.from('cabinet_instances').update({ bulkhead: { ...c.bulkhead, h_adjust: 10 } }).eq('id', c.id))
  if (!todo.has(c.room_id)) todo.set(c.room_id, []); todo.get(c.room_id).push(c)
  console.log('h_adjust 10:', rooms.find(r => r.id === c.room_id).name, c.label)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  const redo = new Map(todo); if (!redo.has(WIR)) redo.set(WIR, [])
  for (const [rid, list] of redo) {
    await page.goto(`http://localhost:3001/canvas/${rid}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
    const labels = [...list.map(c => c.label), ...(rid === WIR ? ['BC-02', 'BC-03', 'BC-08'] : [])]
    const r = await page.evaluate(async labels => { const o = []; for (const l of labels) { const st = window.__canvasApi.getState().cabinets.find(c => c.label === l); await window.__canvasApi.updateCabinet(l, { dz: st.dz }); o.push(l) } return o }, labels)
    await sleep(3000)
    const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let e = 0
    for (const ci of issues) for (const x of ci.errors) { e++; console.log(`  ERR ${ci.label} ${x.code}: ${x.message}`) }
    console.log(rooms.find(x => x.id === rid).name, 're-resolved', r.join(','), 'errors', e)
  }
} finally { await browser.close() }
