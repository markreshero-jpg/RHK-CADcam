import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
const roomId = process.env.ROOM_ID, OUT = process.argv[2]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], defaultViewport: { width: 1720, height: 950 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(5000)
  const [x, y] = (process.env.AT ?? '966,640').split(',').map(Number)
  await page.mouse.move(x, y)
  for (let i = 0; i < 8; i++) { await page.mouse.wheel({ deltaY: -120 }); await sleep(150) }
  await sleep(800)
  await page.screenshot({ path: OUT })
} finally { await browser.close() }
