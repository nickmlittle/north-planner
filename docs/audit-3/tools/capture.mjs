// Screenshot helper for the audit 3 PR briefs. It is not part of the app.
//
// Usage (dev server running: npm run dev -- --port 5174 --strictPort --mode localonly):
//   node docs/audit-3/tools/capture.mjs <name> "<query>" [--phone|--desktop] [--width 1280] [--out /tmp/north-shots]
//   node docs/audit-3/tools/capture.mjs plan "view=budget&budgetView=plan&month=2026-11"
// Seeds the baseline fixture (scripts/baseline-seed.html) first, opens http://localhost:5174/?<query>,
// and writes <name>-phone.png (375×812) and <name>-desktop.png (1440×900): the viewport, then a
// full-height copy (<name>-*-full.png) that grows the viewport to the inner scroll container.
//
// Playwright isn't a project dependency. Point NORTH_PLAYWRIGHT_DIR at a node_modules that has it
// (default: the npx cache used for earlier reviews) and NORTH_CHROMIUM at a Chromium binary if the
// bundled one is missing.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const args = process.argv.slice(2)
const [name, query = ''] = args.filter(arg => !arg.startsWith('--') && !/^\d+$/.test(arg))
const flag = key => args.includes(`--${key}`)
const option = key => { const index = args.indexOf(`--${key}`); return index >= 0 ? args[index + 1] : undefined }
if (!name) { console.error('Usage: node capture.mjs <name> "<query>" [--phone|--desktop] [--width N] [--out dir]'); process.exit(1) }

const require = createRequire(process.env.NORTH_PLAYWRIGHT_DIR ?? `${process.env.HOME}/.npm/_npx/e41f203b7505f1fb/node_modules/`)
const { chromium } = require('playwright')
const executablePath = process.env.NORTH_CHROMIUM ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const out = option('out') ?? '/tmp/north-shots'
mkdirSync(out, { recursive: true })

const sizes = []
if (!flag('desktop')) sizes.push(['phone', { width: 375, height: 812 }, true])
if (!flag('phone')) sizes.push(['desktop', { width: Number(option('width') ?? 1440), height: 900 }, false])

const browser = await chromium.launch({ executablePath })
for (const [label, viewport, mobile] of sizes) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile })
  const page = await context.newPage()
  page.on('pageerror', error => console.log('PAGE ERROR', error.message))
  await page.goto('http://localhost:5174/scripts/baseline-seed.html')
  await page.waitForURL(/view=(budget|plan)/)
  await page.goto(`http://localhost:5174/?${query}`)
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/${name}-${label}.png` })
  const height = await page.evaluate(() => {
    let max = document.documentElement.scrollHeight
    for (const element of document.querySelectorAll('*')) {
      const style = getComputedStyle(element)
      if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 4 && element.clientHeight > 200) max = Math.max(max, element.scrollHeight + element.getBoundingClientRect().top + 40)
    }
    return Math.ceil(Math.min(max, 9000))
  })
  await page.setViewportSize({ width: viewport.width, height })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/${name}-${label}-full.png` })
  console.log(`wrote ${out}/${name}-${label}.png and -full.png`)
  await context.close()
}
await browser.close()
