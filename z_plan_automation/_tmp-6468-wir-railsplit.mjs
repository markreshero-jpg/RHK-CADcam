// RHK6468 WIR (Mark 2026-11-17): TC-16 mirror face rail 1757 in Blonde Oak, grain up -> 2 equal pieces (<= 1200),
// butt joint + wall ends untaped. Front flush with the 32 frame with an 18 board (z = 14 + 18 = 32).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const CAB = '6e98a675-43af-4ca1-a705-c54064b1c247', P1 = '0d73ed58-1553-42e4-8050-fecc436bc1d4'
const parts = chk('p', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', CAB))
const p1 = parts.find(p => p.id === P1)
const ex = { ...p1.expressions, z: 'cab.d + 18 - t.exposed', dx: 'cab.w / 2' }
chk('u1', await sb.from('cabinet_custom_parts').update({ name: 'Filler 1 of 2', expressions: ex, dx: 878.5, z: 14, edge_left: false, edge_right: false }).eq('id', P1))
if (!parts.some(p => p.name === 'Filler 2 of 2')) {
  const { id, created_at, updated_at, ...rest } = p1
  chk('i2', await sb.from('cabinet_custom_parts').insert({ ...rest, name: 'Filler 2 of 2', sort_order: 1, x: 878.5, dx: 878.5, z: 14, edge_left: false, edge_right: false, expressions: { ...ex, x: 'cab.w / 2' } }))
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto('http://localhost:3001/canvas/dfa682a3-020b-4704-8661-3dbbd6cdf224', { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  const out = await page.evaluate(async () => {
    const o = {}
    for (const l of ['TC-16', 'BC-04', 'BC-05', 'BC-06', 'BC-07', 'BC-09', 'BC-10']) {
      const st = window.__canvasApi.getState().cabinets.find(c => c.label === l)
      await window.__canvasApi.updateCabinet(l, { dz: st.dz })
      const r = await window.__canvasApi.getResolved(l)
      o[l] = [...r.toekick_parts.filter(p => p.part_key === 'kick_front_face').map(p => `face ${p.DY}@${p.X}`), ...r.custom_parts.map(p => `${p.name} ${p.dx}x${p.dy} x${p.x} z${p.z} e${+p.edge_top}${+p.edge_bottom}${+p.edge_left}${+p.edge_right}`)]
    }
    return o
  })
  console.log(JSON.stringify(out, null, 1))
} finally { await browser.close() }
