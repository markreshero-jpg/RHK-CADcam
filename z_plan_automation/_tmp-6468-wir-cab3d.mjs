// Screenshot a cabinet's edit modal (3D / section) — node <roomId> <label> <out.png>
import puppeteer from 'puppeteer-core'
const [ROOM, LABEL, OUT] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1700, height: 1050 }, protocolTimeout: 600000 })
try {
  const p = await b.newPage(); await p.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); p.on('dialog', d => d.dismiss())
  await p.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await p.waitForFunction(() => window.__canvasApi, { timeout: 90000 }); await sleep(4000)
  await p.evaluate(l => window.__canvasApi.openCabinet(l), LABEL); await sleep(6000)
  for (const t of (process.argv[5] ?? '').split(',').filter(Boolean)) { await p.evaluate(t => [...document.querySelectorAll('button')].filter(e => e.offsetParent && e.textContent.trim() === t).pop()?.click(), t); await sleep(4000); await p.screenshot({ path: OUT.replace('.png', '-' + t + '.png') }) }
  await p.screenshot({ path: OUT })
  const tabs = await p.evaluate(() => [...document.querySelectorAll('button')].filter(e => e.offsetParent).map(e => e.textContent.trim()).filter(t => t && t.length < 20))
  console.log(tabs.join(' | '))
} finally { await b.close() }
