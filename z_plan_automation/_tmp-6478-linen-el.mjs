// RHK6478 US Hallway Linen: SVG elements on the Wall 2 elevation that reach past x=1300px.
import puppeteer from 'puppeteer-core'
const R = 'b6377e60-bed3-4e5c-af80-7ea320db6ff5'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000, defaultViewport: { width: 1800, height: 1100 } })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const click = t => page.evaluate(v => { const b = [...document.querySelectorAll('button')].filter(e => e.textContent.trim() === v && e.offsetParent); b.at(-1)?.click(); return b.length }, t)
  await click('Elevation'); await sleep(4000); await click('Wall 2'); await sleep(3000)
  const info = await page.evaluate(() => [...document.querySelectorAll('svg *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > 1300 && r.top > 600 && r.bottom < 720 }).map(el => {
    const r = el.getBoundingClientRect(); const chain = []; let p = el; for (let i = 0; i < 6 && p; i++) { chain.push(p.tagName + (p.getAttribute('data-part') ? '[' + p.getAttribute('data-part') + ']' : '') + (p.getAttribute('data-cab') ? '{' + p.getAttribute('data-cab') + '}' : '')); p = p.parentElement }
    return { tag: el.tagName, x: Math.round(r.left), x1: Math.round(r.right), y: Math.round(r.top), y1: Math.round(r.bottom), attrs: [...el.attributes].map(a => a.name + '=' + a.value.slice(0, 60)).join(' '), text: el.textContent?.slice(0, 40), chain: chain.join('<') }
  }))
  console.log(JSON.stringify(info, null, 1))
} finally { await browser.close() }
