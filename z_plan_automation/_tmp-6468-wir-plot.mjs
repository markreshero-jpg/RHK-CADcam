// Plot Mark's "Mark Ups for Ai" plan strokes to an SVG for reading.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const a = (await sb.from('room_annotations').select('*').eq('room_id', 'dfa682a3-020b-4704-8661-3dbbd6cdf224').eq('cad_layer_id', '22a419f4-10ac-45a0-97a2-8a27cc111f16')).data
const pts = []; const paths = []; const texts = []
for (const r of a) {
  const g = r.geom
  if (g.pts) { paths.push(g.pts); pts.push(...g.pts) }
  else if (g.a && g.b) { paths.push([g.a, g.b]); pts.push(g.a, g.b) }
  if (r.text) { const at = g.at ?? g.pts?.[0] ?? g.a; texts.push([at, r.text]); pts.push(at) }
  console.log(r.kind, r.view, JSON.stringify(r.text), Object.keys(g), JSON.stringify(r.style))
}
const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
console.log('bounds', x0, x1, y0, y1, 'n', a.length)
const pad = 20, W = x1 - x0 + 2 * pad, H = y1 - y0 + 2 * pad
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0 - pad} ${y0 - pad} ${W} ${H}" width="1400" height="${Math.round(1400 * H / W)}"><rect x="${x0 - pad}" y="${y0 - pad}" width="${W}" height="${H}" fill="white"/>` +
  paths.map(p => `<polyline fill="none" stroke="black" stroke-width="${W / 500}" points="${p.map(q => q.x + ',' + q.y).join(' ')}"/>`).join('') +
  texts.map(([at, t]) => `<text x="${at.x}" y="${at.y}" font-size="${W / 40}" fill="red">${t.replace(/</g, '')}</text>`).join('') + '</svg>'
fs.writeFileSync(process.argv[2], svg)
