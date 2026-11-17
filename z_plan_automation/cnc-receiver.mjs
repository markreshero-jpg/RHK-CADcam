#!/usr/bin/env node
// Local file receiver for optimiser saves from Chrome (production-run / optimiser-run skills).
// The app's Download all / Download PDF use File System Access pickers the extension can't drive;
// the tab gets fakes (cnc-picker-shim.js) whose writable.close() POSTs here.
//
//   node z_plan_automation/cnc-receiver.mjs <out dir> [port=8765]
//
// POST /save?name=<relative path>  body = file bytes  → <out dir>/<relative path>
// GET  /list                         → JSON list of files received
// Never overwrites: a name that already exists gets 409 (stop and look).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const out = process.argv[2]
const port = Number(process.argv[3] || 8765)
if (!out) { console.error('usage: cnc-receiver.mjs <out dir> [port]'); process.exit(1) }
fs.mkdirSync(out, { recursive: true })
const root = path.resolve(out)
const received = []

const cors = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
}

http.createServer((req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const u = new URL(req.url, 'http://127.0.0.1')
  if (req.method === 'GET' && u.pathname === '/list') {
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(received))
  }
  if (req.method !== 'POST' || u.pathname !== '/save') { res.writeHead(404); return res.end() }
  const name = u.searchParams.get('name') || ''
  const dest = path.resolve(root, name)
  if (!name || !dest.startsWith(root + path.sep)) { res.writeHead(400); return res.end('bad name') }
  if (fs.existsSync(dest)) { res.writeHead(409); return res.end('exists: ' + name) }
  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const buf = Buffer.concat(chunks)
    fs.writeFileSync(dest, buf)
    received.push({ name, bytes: buf.length })
    console.log(`saved ${name} (${buf.length} B)`)
    res.writeHead(200); res.end('ok')
  })
}).listen(port, '127.0.0.1', () => console.log(`receiver on 127.0.0.1:${port} → ${root}`))
