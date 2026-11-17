import puppeteer from 'puppeteer-core'
const [link, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const v = await b.newPage(); await v.setViewport({ width: 1200, height: 800 })
  v.on('pageerror', e => console.log('VIEWERERR', e.message))
  const r = await v.goto(link, { waitUntil: 'load', timeout: 120000 })
  console.log('status', r.status(), 'url', v.url())
  await v.waitForFunction('!!window.__ready', { timeout: 120000 }); await sleep(1500)
  await v.click('#reset'); await sleep(800)
  await v.screenshot({ path: `${outDir}/link.png` })
  console.log('ar href', await v.evaluate(() => document.querySelector('#ar')?.getAttribute('href')?.slice(-40)))
  const bad = await v.goto(link.replace(/.{4}$/, '0000')); console.log('bad token', bad.status())
  await v.screenshot({ path: `${outDir}/link-bad.png` })
} finally { await b.close() }
