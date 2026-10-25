// Cross section (z_section_view): step the cut along a wall via the At box and log the
// hardware / fixture items cut at each position (X4 check).
//   node z_plan_automation/sweep-cross-section.mjs <roomId> <wall button> <layer set> <from> <to> <step> [shotAt]  (OUT = png path)
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const [ROOM, WALL, SET, A, B, STEP, SHOT] = process.argv.slice(2)
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', defaultViewport: { width: 1600, height: 1000 } })
const p = await b.newPage(); await p.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
p.on('pageerror', e => console.log('PAGE ERROR', e.message))
await p.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
await p.waitForFunction(() => window.__canvasApi, { timeout: 60000 }); await sleep(4000)
const click = t => p.evaluate(t => { const e = [...document.querySelectorAll('button')].reverse().find(e => e.textContent.trim() === t && e.offsetParent); e?.click(); return !!e }, t)
await click('Elevation'); await sleep(2000); await click(WALL); await sleep(1000)
await p.evaluate(n => { const sel = [...document.querySelectorAll('select')].find(e => [...e.options].some(o => o.text === 'Line drawing')); const o = [...sel.options].find(o => o.text === n); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, o.value); sel.dispatchEvent(new Event('change', { bubbles: true })) }, SET)
await sleep(800); await click('Cross section'); await sleep(5000)
for (let x = +A; x <= +B; x += +STEP) {
  await p.evaluate(x => { const i = [...document.querySelectorAll('input[type=number]')].find(e => e.className.includes('violet')); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, String(x)); i.dispatchEvent(new Event('input', { bubbles: true })) }, x)
  await sleep(150)
  const m = await p.evaluate(() => { const m = {}; for (const e of document.querySelectorAll('svg [data-item]')) m[e.dataset.item] = (m[e.dataset.item] ?? 0) + 1; return m })
  const hw = Object.entries(m).filter(([k]) => /hinge|handle|runner|bin|fixture/.test(k))
  if (hw.length) console.log(x, JSON.stringify(Object.fromEntries(hw)))
  if (SHOT && x === +SHOT) await p.screenshot({ path: process.env.OUT })
}
await b.close()
