// Before/after diff of the Plan and Transfers states for refactors that must not change what you see (audit 3 PR 05, reused by 06).
// It is not part of the app.
//
// Usage: run main's dev server on one port and the branch's on another, both with --mode localonly, then
//   node docs/audit-3/tools/state-diff.mjs --before 5175 --after 5174 [--out /tmp/north-diff] [--only plan-01,transfers-20]
// Each state is reached from a fresh seed (scripts/baseline-seed.html) at 375×812 and 1440×900. For each it saves the
// normalised outerHTML of <main> and a screenshot, and reports DOM and pixel differences. `--strip-before` takes CSS
// selectors removed from the "before" DOM first (by default: the panel main hid with CSS, which PR 05 stops rendering).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const option = (key, fallback) => { const index = args.indexOf(`--${key}`); return index >= 0 ? args[index + 1] : fallback }
const ports = { before: option('before', '5175'), after: option('after', '5174') }
const out = option('out', '/tmp/north-diff')
const only = option('only', '')?.split(',').filter(Boolean)
const stripBefore = option('strip-before', '.monthly-budget-page.budget-view-plan>.budget-v3-people-summary,.monthly-budget-page.budget-view-transfers>.page-frame-body,.monthly-budget-page.budget-view-transfers>.page-frame-controls').split(',').filter(Boolean)
mkdirSync(out, { recursive: true })

const require = createRequire(process.env.NORTH_PLAYWRIGHT_DIR ?? `${process.env.HOME}/.npm/_npx/e41f203b7505f1fb/node_modules/`)
const { chromium } = require('playwright')
const executablePath = process.env.NORTH_CHROMIUM ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`

const plan = (month = '2026-11') => `view=budget&budgetView=plan&month=${month}`
const transfers = (month = '2026-11') => `view=budget&budgetView=transfers&month=${month}`
const editDocument = async (page, change) => { await page.evaluate(source => { const doc = JSON.parse(localStorage.getItem('north.budget.v3')); new Function('doc', source)(doc); localStorage.setItem('north.budget.v3', JSON.stringify(doc)) }, change); await page.reload(); await page.waitForTimeout(400) }
const expandAll = async page => { const button = page.getByRole('button', { name: 'Expand all' }); if (await button.count()) await button.first().click() }
const filter = async (page, phone, label, value) => {
  if (!phone) { await page.locator('.budget-v3-filter-select').nth(label === 'Owner' ? 0 : 1).selectOption({ label: value }); return }
  await page.getByRole('button', { name: /^Filter/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Filter' })
  await sheet.getByLabel(label).selectOption({ label: value })
  await sheet.getByRole('button', { name: 'Done' }).click()
}
const raiseGroceries = async page => {
  await page.goto(`http://localhost:${page.port}/?${plan()}`); await page.waitForTimeout(400)
  await expandAll(page)
  await page.getByRole('button', { name: 'Edit amount for Groceries' }).click()
  await page.getByLabel('Monthly amount for Groceries').fill('335.47')
  await page.getByRole('form', { name: 'Quick edit amount for Groceries' }).getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(300)
}
const person = async (page, phone, name) => { if (phone) await page.getByRole('region', { name: 'Transfers summary' }).getByRole('button', { name, exact: true }).click() }

/** [id, starting query, steps after load] */
const states = [
  ['plan-01-cold', plan(), async () => {}],
  ['plan-02-home-group', plan(), async page => page.locator('.plan-group th button', { hasText: 'Home' }).first().click()],
  ['plan-03-search', plan(), async page => page.getByPlaceholder('Search budget').fill('ins')],
  ['plan-04-owner-ada', plan(), async (page, phone) => filter(page, phone, 'Owner', 'Ada')],
  ['plan-05-category', plan(), async (page, phone) => filter(page, phone, 'Category', 'Lifestyle')],
  ['plan-06-destination', plan(), async page => { await page.getByRole('button', { name: 'Destination', exact: true }).click(); await expandAll(page) }],
  ['plan-07-quick-edit', plan(), async (page, phone) => { if (phone) return 'desktop only'; await expandAll(page); await page.getByRole('button', { name: 'Edit amount for Groceries' }).click() }],
  ['plan-08-editor', plan(), async page => { await expandAll(page); await page.getByRole('button', { name: 'Groceries', exact: true }).click() }],
  ['plan-09-add', plan(), async page => page.getByRole('button', { name: 'Add item' }).first().click()],
  ['plan-10-review-ben', 'view=home&month=2026-11', async page => { await page.getByRole('button', { name: 'Review Ben’s items' }).first().click(); await page.waitForTimeout(300) }],
  ['plan-11-see-items', transfers(), async page => { await page.locator('[data-see-items]').first().click(); await page.waitForTimeout(300) }],
  ['plan-12-month-picker', plan(), async page => page.locator('.budget-v3-month>button:nth-child(2)').first().click()],
  ['plan-13-options', plan(), async (page, phone) => page.getByRole('button', { name: phone ? /^(Budget and account|Plan options)$/ : 'More budget options' }).first().click()],
  ['plan-14-december', plan('2026-12'), async () => {}],
  ['plan-15-first-run', plan(), async page => editDocument(page, 'doc.budget.snapshots = {}; delete doc.budget.importedBaseline')],
  ['plan-16-no-items', plan('2020-01'), async () => {}],
  ['transfers-17-both', transfers(), async () => {}],
  ['transfers-18-ada', transfers(), async (page, phone) => person(page, phone, 'Ada')],
  ['transfers-19-ben', transfers(), async (page, phone) => person(page, phone, 'Ben')],
  ['transfers-20-ticked', transfers(), async page => page.getByRole('button', { name: / done$/ }).first().click()],
  ['transfers-21-changed', transfers(), async page => {
    await page.getByRole('button', { name: /^Fund Monzo Joint.* done$/ }).first().click()
    await raiseGroceries(page)
    await page.goto(`http://localhost:${page.port}/?${transfers()}`); await page.waitForTimeout(400)
  }],
  ['transfers-22-affected', plan(), async page => { await raiseGroceries(page); await page.getByRole('button', { name: 'View affected transfers' }).click(); await page.waitForTimeout(300) }],
  ['transfers-23-no-owner', transfers(), async page => editDocument(page, "doc.budget.accounts.find(a => a.id === 'saving').ownerPersonIds = []")],
  ['transfers-24-no-items', transfers('2020-01'), async () => {}],
  ['transfers-25-account-sheet', transfers(), async (page, phone) => { if (!phone) return 'phone only'; await page.getByRole('button', { name: 'Budget and account' }).click() }],
].filter(([id]) => !only?.length || only.some(prefix => id.startsWith(prefix)))

function url(side, query) { return `http://localhost:${ports[side]}/?${query}` }

const normalise = html => html
  .replace(/_r_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:/g, 'ID')
  .replace(/\s(style)="[^"]*"/g, (m) => m.replace(/\d+(\.\d+)?px/g, 'Npx'))

async function capture(browser, side, [id, query, steps], phone) {
  const page = await browser.newPage({ viewport: phone ? { width: 375, height: 812 } : { width: 1440, height: 900 }, isMobile: phone, hasTouch: phone })
  page.port = ports[side]
  await page.goto(`http://localhost:${ports[side]}/scripts/baseline-seed.html`); await page.waitForURL(/view=/)
  await page.goto(url(side, query)); await page.waitForTimeout(500)
  let note = ''
  try { note = (await steps(page, phone)) ?? '' } catch (error) { note = `step failed: ${error.message.split('\n')[0]}` }
  await page.waitForTimeout(350)
  const html = await page.evaluate(strip => { const main = document.querySelector('main') ?? document.body; const copy = main.cloneNode(true); for (const selector of strip) copy.querySelectorAll(selector).forEach(node => node.remove()); const dialogs = [...document.querySelectorAll('[role=dialog]')].map(node => node.outerHTML).join('\n'); const header = document.querySelector('#mobile-header-page-slot')?.outerHTML ?? ''; return `${copy.outerHTML}\n<!--dialogs-->\n${dialogs}\n<!--header-->\n${header}` }, side === 'before' ? stripBefore : [])
  const file = `${out}/${id}-${phone ? 'phone' : 'desktop'}-${side}`
  writeFileSync(`${file}.html`, normalise(html).replace(/></g, '>\n<'))
  await page.screenshot({ path: `${file}.png` })
  const focus = await page.evaluate(() => { const el = document.activeElement; return el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"` : '' })
  await page.close()
  return { html: normalise(html), file, note, focus }
}

const browser = await chromium.launch({ executablePath })
const report = []
for (const state of states) for (const phone of [false, true]) {
  const before = await capture(browser, 'before', state, phone)
  const after = await capture(browser, 'after', state, phone)
  const same = before.html === after.html
  let firstDiff = ''
  if (!same) { const a = before.html.replace(/></g, '>\n<').split('\n'), b = after.html.replace(/></g, '>\n<').split('\n'); const i = a.findIndex((line, n) => line !== b[n]); firstDiff = `line ${i}: - ${a[i]?.slice(0, 140)} | + ${b[i]?.slice(0, 140)}` }
  const row = `${state[0]} ${phone ? 'phone' : 'desktop'}: DOM ${same ? 'same' : 'DIFFERS'}${before.focus !== after.focus ? ` · focus ${before.focus} → ${after.focus}` : ''}${before.note || after.note ? ` · ${before.note || after.note}` : ''}${firstDiff ? `\n    ${firstDiff}` : ''}`
  report.push(row); console.log(row)
}
await browser.close()
writeFileSync(`${out}/report.txt`, report.join('\n'))
