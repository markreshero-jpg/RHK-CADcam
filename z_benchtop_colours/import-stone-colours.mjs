// Import stone colours (BENCHTOP-COLOURS-SPEC.md C2 + C4).
// Reads stone-colours.json (the catalogue: brand, colour, range, slab size, swatch hex,
// image key) and upserts one child benchtop_materials row per colour under the stone
// type "20mm Stone". Slab photos (prepared by the scratch crop script: <key>.jpg ≤ 4096 px
// wide + <key>-thumb.jpg) are uploaded to the benchtop-textures bucket.
//
//   node z_benchtop_colours/import-stone-colours.mjs <image-dir> [--parent "20mm Stone"]
//
// Re-runnable: rows match on (parent, brand, colour_name); images upsert.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { error: authErr } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
if (authErr) throw authErr

const imgDir = process.argv[2]
const parentName = process.argv.includes('--parent') ? process.argv[process.argv.indexOf('--parent') + 1] : '20mm Stone'
const list = JSON.parse(fs.readFileSync(new URL('./stone-colours.json', import.meta.url), 'utf8'))

const { data: parent, error: pErr } = await sb.from('benchtop_materials').select('id, name').eq('name', parentName).is('parent_id', null).single()
if (pErr) throw pErr
const { data: existing } = await sb.from('benchtop_materials').select('id, brand, colour_name').eq('parent_id', parent.id)
const have = new Map((existing ?? []).map(r => [`${r.brand}|${r.colour_name}`, r.id]))

const slugOf = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
let up = 0, rows = 0
for (const c of list) {
  let texture_path = null, thumb_path = null
  if (c.image && imgDir) {
    const brandDir = slugOf(c.brand)
    texture_path = `${brandDir}/${slugOf(c.colour_name)}.jpg`
    thumb_path = `${brandDir}/${slugOf(c.colour_name)}-thumb.jpg`
    for (const [file, dest] of [[`${c.image}.jpg`, texture_path], [`${c.image}-thumb.jpg`, thumb_path]]) {
      const buf = fs.readFileSync(path.join(imgDir, file))
      const { error } = await sb.storage.from('benchtop-textures').upload(dest, buf, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' })
      if (error) throw new Error(`${dest}: ${error.message}`)
      up++
    }
  }
  const row = {
    parent_id: parent.id, brand: c.brand, colour_name: c.colour_name, colour_code: c.colour_code ?? null,
    range_name: c.range_name ?? null, finish: c.finish ?? null, color: c.hex ?? null,
    sheet_dx: c.slab_w, sheet_dy: c.slab_h, overridden: ['sheet_dx', 'sheet_dy'],
    texture_path, thumb_path, texture_w_mm: texture_path ? c.slab_w : null, texture_h_mm: texture_path ? c.slab_h : null,
    source_url: c.source_url ?? null, notes: c.note ?? null,
    // placeholders — the inherit trigger overwrites these from the stone type
    name: c.colour_name, dz: 0,
  }
  const id = have.get(`${c.brand}|${c.colour_name}`)
  const { error } = id
    ? await sb.from('benchtop_materials').update(row).eq('id', id)
    : await sb.from('benchtop_materials').insert(row)
  if (error) throw new Error(`${c.brand} ${c.colour_name}: ${error.message}`)
  rows++
}
console.log(`${rows} colours under "${parent.name}", ${up} images uploaded`)
