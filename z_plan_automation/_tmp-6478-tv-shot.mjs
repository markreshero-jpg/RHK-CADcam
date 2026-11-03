// RHK6478 DS TV Unit: headless screenshot of the Wall 4 elevation (and 3D) for checking.
import puppeteer from 'puppeteer-core'
const R = '46c02367-c556-489e-9907-67785eb2cd87', OUT = process.argv[2] ?? 'C:/Users/mark/AppData/Local/Temp/rhk'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 })
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(3000)
  const click = t => page.evaluate(t => { const b = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === t); b[b.length - 1].click() }, t)
  await click('Elevation'); await sleep(1500); await click('Wall 4'); await sleep(2500)
  await page.screenshot({ path: `${OUT}/tv-elev.png` })
  await click('3D'); await sleep(8000); await click('⟲ Reset view').catch(() => {})
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Reset view/.test(b.textContent))?.click()); await sleep(3000)
  await page.screenshot({ path: `${OUT}/tv-3d.png` })
} finally { await browser.close() }
console.log('shots in', OUT)
