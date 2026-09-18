// Layer-aware selection + labels: with a kicks-only set (names + sizes on), only
// kick areas are clickable and only cabinets with kicks get labels — in plan,
// elevation and 3D. Needs a set named env KICK_SET (default 'ZZ kicks + labels').
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const KICK_SET = process.env.KICK_SET ?? 'ZZ kicks + labels'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1720, height: 950 },
})
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => { if (!/Failed to fetch/.test(e.message)) console.log('PAGE ERROR:', e.message) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(6000)

  const chooseSet = async name => {
    for (const h of await page.$$('select')) {
      const v = await h.evaluate((el, n) => [...el.options].some(o => o.value === '__manage__') ? [...el.options].find(o => o.text === n)?.value : null, name)
      if (v) { await h.select(v); await sleep(1500); return }
    }
    throw new Error('set not found ' + name)
  }
  const clickView = async l => { await page.evaluate(x => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === x).pop()?.click(), l); await sleep(2500) }
  const status = () => page.evaluate(() =>
    [...document.querySelectorAll('span, div')].map(e => e.textContent ?? '')
      .find(t => /^(base|tall|wall)[\w ]* · [^·]+ · \d+×\d+×\d+$/.test(t.trim()))?.trim() ?? '(nothing)')
  const clickAt = async (x, y) => {
    await page.keyboard.press('Escape'); await sleep(1500)
    await page.mouse.move(x, y, { steps: 3 }); await sleep(200)
    await page.mouse.down(); await sleep(50); await page.mouse.up(); await sleep(900)
    return status()
  }
  // SVG screen point of a cabinet-label text's parent group polygon centre etc.
  const labelTexts = () => page.evaluate(() => [...document.querySelectorAll('svg text')]
    .map(t => t.textContent.trim()).filter(t => /^(BC|WC|TC|KICK)/.test(t)))

  // ── Plan ──
  await chooseSet(KICK_SET)
  console.log('plan labels (kicks set):', JSON.stringify(await labelTexts()))
  // screen centre of each drawn kick polygon vs. its cabinet footprint centre
  const planTargets = await page.evaluate(() => {
    const out = []
    for (const g of document.querySelectorAll('g')) {
      const kick = g.querySelector(':scope > polygon[data-part="kick_front_face"]')
      if (!kick) continue
      const r = kick.getBoundingClientRect()
      out.push({ kick: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] })
    }
    return out.slice(0, 3)
  })
  for (const t of planTargets) console.log('plan click on kick', t.kick, '→', await clickAt(...t.kick))
  // BC-04 centre from the Full parts layout (carcase hidden → should select nothing)
  console.log('plan click on hidden carcase centre (1200,470) →', await clickAt(1200, 470))
  await page.screenshot({ path: path.join(OUT, 'hit-plan-kicks.png') })

  // ── Elevation ──
  await clickView('Elevation'); await clickView('Wall 2')
  console.log('elev labels (kicks set):', JSON.stringify(await labelTexts()))
  console.log('elev click on hidden WC-03 (1060,320) →', await clickAt(1060, 320))
  console.log('elev click on BC-03 kick (990,805) →', await clickAt(990, 805))
  await page.screenshot({ path: path.join(OUT, 'hit-elev-kicks.png') })

  // ── 3D ──
  await clickView('3D'); await sleep(12000)
  console.log('3D click on hidden TC-01 door (930,300) →', await clickAt(930, 300))
  await page.screenshot({ path: path.join(OUT, 'hit-3d-kicks.png') })

  // ── Full parts regression ──
  await chooseSet('Full parts'); await sleep(6000)
  console.log('3D full parts click TC-01 (930,300) →', await clickAt(930, 300))
  await clickView('Plan')
  console.log('plan full parts labels count:', (await labelTexts()).length)
  console.log('plan full parts click BC-04 (1200,470) →', await clickAt(1200, 470))
} finally { await browser.close() }
