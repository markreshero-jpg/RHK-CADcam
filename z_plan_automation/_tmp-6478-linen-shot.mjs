// RHK6478 US Hallway Linen: elevation screenshot.  node _tmp-6478-linen-shot.mjs outDir
import puppeteer from 'puppeteer-core'
const R = 'b6377e60-bed3-4e5c-af80-7ea320db6ff5', OUT = process.argv[2]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000, defaultViewport: { width: 1800, height: 1100 } })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const click = t => page.evaluate(v => { const b = [...document.querySelectorAll('button')].filter(e => e.textContent.trim() === v && e.offsetParent); b.at(-1)?.click(); return b.length }, t)
  console.log('Elevation', await click('Elevation')); await sleep(5000)
  await page.screenshot({ path: `${OUT}/linen_elev.png` }); for (const w of ['Wall 2','Wall 3']) { await click(w); await sleep(3000); await page.screenshot({ path: `${OUT}/linen_${w.replace(' ','')}.png` }) }
  // Lines in the elevation SVG that reach right of TC-04 (x > the room's cabinets)
  const info = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('svg')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)
    const s = svgs[0]; const out = []
    for (const el of s.querySelectorAll('line,rect,path,polyline,polygon')) {
      const r = el.getBoundingClientRect(); if (r.width > 0 || r.height > 0) out.push({ tag: el.tagName, x0: Math.round(r.left), x1: Math.round(r.right), y0: Math.round(r.top), y1: Math.round(r.bottom), stroke: el.getAttribute('stroke'), fill: el.getAttribute('fill'), dash: el.getAttribute('stroke-dasharray'), cls: el.getAttribute('class'), key: el.parentElement?.getAttribute('data-key') })
    }
    return out
  })
  console.log(JSON.stringify(info.filter(e => e.y1 - e.y0 < 4 && e.x1 - e.x0 > 40).sort((a, b) => b.x1 - a.x1).slice(0, 25)))
} finally { await browser.close() }
