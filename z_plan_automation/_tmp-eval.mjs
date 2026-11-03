// node _tmp-eval.mjs <roomId> <jsFile>  — runs jsFile body (async fn, gets api) in the canvas page, prints JSON result
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
const [roomId, jsFile] = process.argv.slice(2)
const body = fs.readFileSync(jsFile, 'utf8')
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--window-size=1600,1000'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: Number(process.env.DSF || 1) })
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  if (process.env.ELEV) await page.evaluateOnNewDocument((k, v) => { try { localStorage.setItem(k, v) } catch {} }, 'rhk.canvasView.' + roomId, JSON.stringify({ view: 'elevation', elevWallId: process.env.ELEV, elevWallSide: 'face' }))
  await page.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 })
  await new Promise(r => setTimeout(r, 2500))
  const res = await page.evaluate(`(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const api = () => window.__canvasApi; ${body} })()`)
  console.log(JSON.stringify(res, null, 1))
  if (process.env.SHOT) { await new Promise(r => setTimeout(r, 1500)); await page.screenshot({ path: process.env.SHOT, ...(process.env.CLIP ? { clip: (([x, y, width, height]) => ({ x, y, width, height }))(process.env.CLIP.split(',').map(Number)) } : {}) }) }
} finally { await browser.close().catch(() => {}) }
