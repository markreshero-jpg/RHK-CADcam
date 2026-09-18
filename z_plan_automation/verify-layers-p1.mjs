// Display layers verification: ONE active layer set across plan / elevation / 3D,
// all sets editable, Layer Manager create → edit → save → delete round trip.
// Screenshots to argv[2] directory.
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const PORT = process.env.DEV_PORT ?? '3001'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1720, height: 950 },
})
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot', name) }
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:${PORT}/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(5000)

  const layerSelect = async () => {
    for (const h of await page.$$('select')) {
      if (await h.evaluate(el => [...el.options].some(o => o.value === '__manage__'))) return h
    }
    throw new Error('layer select not found')
  }
  const current = async () => (await layerSelect()).evaluate(el => el.options[el.selectedIndex].text)
  const chooseSet = async name => {
    const sel = await layerSelect()
    const value = await sel.evaluate((el, n) => [...el.options].find(o => o.text === n)?.value, name)
    if (!value) throw new Error('no set ' + name)
    await sel.select(value)
    await sleep(1200)
  }
  const clickButton = async label => {
    const ok = await page.evaluate(l => {
      const b = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === l).pop()
      if (b) b.click()
      return !!b
    }, label)
    if (!ok) throw new Error('button not found: ' + label)
    await sleep(1200)
  }
  const partCounts = () => page.evaluate(() => {
    const c = {}
    for (const p of document.querySelectorAll('polygon[data-part]')) c[p.dataset.part] = (c[p.dataset.part] ?? 0) + 1
    return c
  })

  console.log('options:', await (await layerSelect()).evaluate(el => [...el.options].map(o => o.text).join(' | ')))
  console.log('initial set:', await current())

  // One set for all views
  await chooseSet('Kicks')
  console.log('plan kicks parts:', JSON.stringify(await partCounts()))
  await clickButton('Elevation'); await clickButton('Wall 2'); await sleep(1500)
  console.log('elevation set after choosing in plan:', await current())
  await shot(page, 'u-elev-kicks.png')
  await clickButton('3D'); await sleep(4000)
  console.log('3D set after choosing in plan:', await current())
  await shot(page, 'u-3d-kicks.png')
  await clickButton('Plan')

  // Manager: no locks; create, edit, save, delete a temp set
  await (await layerSelect()).select('__manage__'); await sleep(1500)
  const locks = await page.evaluate(() => document.body.innerText.includes('Built-in') || document.body.innerText.includes('🔒'))
  console.log('any locked/built-in markers:', locks)
  await clickButton('Full parts')
  await clickButton('Duplicate')
  const input = await page.$('input[placeholder="Set name"]')
  await input.click({ clickCount: 3 }); await input.type('ZZ verify temp')
  await clickButton('Create'); await sleep(1500)
  // uncheck the Carcase group in the plan tab → live preview hides carcase parts
  await page.evaluate(() => {
    const lbl = [...document.querySelectorAll('label')].find(l => l.textContent.trim().toLowerCase() === 'carcase')
    lbl?.querySelector('input')?.click()
  })
  await sleep(1000)
  console.log('preview parts after hiding carcase:', JSON.stringify(await partCounts()))
  await clickButton('Save'); await sleep(1500)
  console.log('notice after save:', await page.evaluate(() => document.body.innerText.includes('Saved.')))
  await shot(page, 'u-manager-temp.png')
  await clickButton('Delete'); await sleep(500)
  await clickButton('Delete'); await sleep(1500)   // confirm
  const stillThere = await page.evaluate(() => document.body.innerText.includes('ZZ verify temp'))
  console.log('temp set removed:', !stillThere)
  await clickButton('Schematic')
  console.log('Schematic name editable:', await page.evaluate(() => {
    const i = [...document.querySelectorAll('input')].find(x => x.value === 'Schematic')
    return !!i && !i.disabled
  }))
  await shot(page, 'u-manager-schematic.png')
} finally { await browser.close() }
