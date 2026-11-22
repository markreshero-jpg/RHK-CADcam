// Nightly backup helper: mirror every stored file into a folder (adds + updates, never deletes).
// usage: node storage-sync.cjs <objects.tsv> <outDir>
//   objects.tsv = bucket \t name \t size \t eTag per line (written by nightly-backup.ps1 from storage.objects)
// Signs in as the automation admin from .env.local. Read-only on the Supabase side.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const root = path.resolve(__dirname, '..', '..')
const { createClient } = require(path.join(root, 'node_modules/@supabase/supabase-js'))
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]))
const md5 = b => crypto.createHash('md5').update(b).digest('hex')

;(async () => {
  const [list, outDir] = process.argv.slice(2)
  const rows = fs.readFileSync(list, 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t'))
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { error: authErr } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
  if (authErr) throw new Error('sign in: ' + authErr.message)
  let kept = 0, fetched = 0, bytes = 0
  const bad = []
  for (const [bucket, name, size, etagRaw] of rows) {
    const dest = path.join(outDir, bucket, ...name.split('/'))
    const etag = (etagRaw || '').replace(/"/g, '')
    const hasMd5 = /^[0-9a-f]{32}$/.test(etag)
    // Already have it: same size, and same md5 when Supabase recorded one.
    if (fs.existsSync(dest) && fs.statSync(dest).size === Number(size) && (!hasMd5 || md5(fs.readFileSync(dest)) === etag)) { kept++; continue }
    const { data, error } = await sb.storage.from(bucket).download(name)
    if (error || !data) { bad.push(`${bucket}/${name}: ${error ? error.message : 'no data'}`); continue }
    const buf = Buffer.from(await data.arrayBuffer())
    if (buf.length !== Number(size) || (hasMd5 && md5(buf) !== etag)) { bad.push(`${bucket}/${name}: download does not match Supabase's record`); continue }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, buf)
    if (!fs.readFileSync(dest).equals(buf)) { bad.push(`${bucket}/${name}: file on disk differs after writing`); continue }
    fetched++; bytes += buf.length
  }
  console.log(`storage: ${rows.length} files, ${kept} already saved, ${fetched} new or changed (${(bytes / 1048576).toFixed(1)} MB)`)
  if (bad.length) { console.log('STORAGE FAILED:\n' + bad.join('\n')); process.exit(2) }
})().catch(e => { console.error('STORAGE FAILED: ' + String(e)); process.exit(1) })
