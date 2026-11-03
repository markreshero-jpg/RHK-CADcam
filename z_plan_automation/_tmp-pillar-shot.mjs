import puppeteer from 'puppeteer-core'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const dir = process.argv[2]
const srv = http.createServer((q, s) => { const f = path.join(dir, decodeURIComponent(q.url.split('?')[0].split('#')[0])); if (!fs.existsSync(f)) { s.statusCode = 404; return s.end() } s.setHeader('access-control-allow-origin', '*'); s.end(fs.readFileSync(f)) }).listen(8765)
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
for (const [glb, out] of process.argv.slice(3).map(a => a.split(':'))) {
  const p = await b.newPage(); await p.setViewport({ width: 1200, height: 500 })
  await p.goto(`http://localhost:8765/view.html#/${glb}`); await p.waitForFunction(() => document.title === 'done', { timeout: 30000 })
  await p.screenshot({ path: path.join(dir, out) })
}
await b.close(); srv.close()
