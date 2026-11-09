import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// Plan and Transfers are separate screens at every width (UX review §6.3): the rule that hides
// the other screen must sit outside any media query, or a link would mean different things per device.
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Top-level rule bodies only: drops every @media block, including the rules nested inside it. */
function topLevelRules(source: string) {
  const rules: { selector: string; body: string }[] = []
  let depth = 0, start = 0, mediaDepth = -1
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '{') {
      const head = source.slice(start, i).trim()
      if (depth === 0 && head.startsWith('@')) mediaDepth = 0
      else if (mediaDepth < 0 && depth === 0) {
        const end = source.indexOf('}', i)
        rules.push({ selector: head.replace(/\s+/g, ' '), body: source.slice(i + 1, end) })
        i = end; start = end + 1; continue
      }
      depth++; start = i + 1
    } else if (source[i] === '}') {
      depth--; start = i + 1
      if (depth === 0) mediaDepth = -1
    } else if (source[i] === ';' && depth === 0) start = i + 1
  }
  return rules
}

it('hides the other budget screen at every width, not only on phones', () => {
  const hidden = topLevelRules(css).filter(rule => /display\s*:\s*none/.test(rule.body)).flatMap(rule => rule.selector.split(',').map(selector => selector.trim()))
  expect(hidden).toContain('.monthly-budget-page.budget-view-plan>.budget-v3-people-summary')
  expect(hidden).toContain('.monthly-budget-page.budget-view-transfers>.page-frame-body')
})
