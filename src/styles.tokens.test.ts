import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MOBILE_QUERY } from './breakpoints'

// Keeps every stylesheet on the design tokens: raw values live only in the :root block at the top of
// styles.css, and everything else, including component stylesheets, goes through var(--…).
// See the token pass in UX review §6.5 and the design system in audit 3 (plan §2.3).
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '')
const css = stripComments(readFileSync(new URL('./styles.css', import.meta.url), 'utf8'))
const rootEnd = css.indexOf('\n}\n')
const otherFiles = (readdirSync(new URL('.', import.meta.url), { recursive: true }) as string[])
  .filter(file => file.endsWith('.css') && file !== 'styles.css')
  .map(file => ({ file, source: stripComments(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')) }))
/** Everything after the token block, then every other stylesheet in src/. */
const rest = [css.slice(rootEnd + 3), ...otherFiles.map(({ source }) => source)].join('\n')
const allCss = [css, ...otherFiles.map(({ source }) => source)].join('\n')

/** `selector { property: value }` for every declaration after the token block, media queries included. */
const declarations = [...rest.matchAll(/([^{}]*)\{([^{}]*)\}/g)].flatMap(([, selector, body]) =>
  body!.split(';').flatMap(part => {
    const match = part.match(/^\s*([a-zA-Z-]+)\s*:\s*([\s\S]+?)\s*$/)
    return match && !match[1]!.startsWith('--') ? [{ selector: selector!.trim().replace(/\s+/g, ' '), property: match[1]!.toLowerCase(), value: match[2]! }] : []
  }))
const offenders = (test: (d: { selector: string; property: string; value: string }) => boolean) =>
  declarations.filter(test).map(d => `${d.selector} { ${d.property}: ${d.value} }`)

describe('design tokens', () => {
  it('has one token block, at the top of styles.css', () => {
    expect(css.trimStart().startsWith(':root {')).toBe(true)
    // Media queries may swap in viewport-specific values (the page gutter, the touch control height).
    expect(rest).not.toMatch(/(^|[}\s]):root\s*\{[^}]*--(?!page-|desktop-|grouped-|control-h|row-h)/)
    expect(otherFiles.filter(({ source }) => /(^|[}\s]):root\s*\{/.test(source)).map(({ file }) => file)).toEqual([])
  })

  it('uses colour tokens instead of colour literals', () => {
    expect(offenders(d => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b/i.test(d.value.replace(/var\(--[\w-]+\)/g, '')) && d.property !== 'white-space')).toEqual([])
  })

  it('uses radius tokens', () => {
    expect(offenders(d => d.property === 'border-radius' && !/^(0|50%|(var\(--radius-[a-z]+\)|0)( (var\(--radius-[a-z]+\)|0))*)$/.test(d.value))).toEqual([])
  })

  it('uses the type scale: --text-* tokens, inherit, or a fluid clamp between two of them', () => {
    const scale = /^(inherit|var\(--text-[\w-]+\)|clamp\(var\(--text-[\w-]+\),\s*[\d.]+vw,\s*var\(--text-[\w-]+\)\))$/
    expect(offenders(d => d.property === 'font-size' && !scale.test(d.value))).toEqual([])
    expect(offenders(d => d.property === 'font' && /\d(px|r?em)\b/.test(d.value))).toEqual([])
  })

  it('keeps the body floor: nothing below --text-xs, and xs is for uppercase labels and badges only', () => {
    const xs = declarations.filter(d => /var\(--text-xs\)/.test(d.value)).map(d => d.selector)
    expect(xs.every(selector => /eyebrow|budget-v3-picker small/.test(selector))).toBe(true)
  })

  it('uses spacing tokens; raw px only for 1–2px nudges, negative offsets and 40px+ layout geometry', () => {
    const spacing = /^(padding|margin|gap|row-gap|column-gap)(-[a-z-]+)?$/
    const offScale = (value: string) => [...value.matchAll(/(^|[^\w.-])(-?)(\d+)px\b/g)].some(([, , minus, n]) => !minus && +n! > 2 && +n! < 40)
    expect(offenders(d => spacing.test(d.property) && offScale(d.value))).toEqual([])
  })

  it('uses only the three width breakpoints (640 / 768 / 1100) and the landscape-phone query, in every stylesheet', () => {
    const widths = [...allCss.matchAll(/@media[^{]*/g)].flatMap(([query]) => [...query.matchAll(/(min|max)-width:\s*(\d+)px/g)].map(([, kind, n]) => `${kind}-${n}`))
    expect([...new Set(widths)].filter(w => !['max-640', 'min-641', 'max-767', 'min-768', 'max-980', 'min-981', 'max-1099', 'min-1100'].includes(w))).toEqual([])
  })

  it('keeps the CSS mobile query in step with MOBILE_QUERY in breakpoints.ts', () => {
    const normalise = (query: string) => query.replace(/\s+/g, '')
    const cssMobile = [...allCss.matchAll(/@media([^{]*max-width:\s*767px[^{]*)\{/g)].map(([, query]) => normalise(query!)).filter(query => query.includes('orientation'))
    expect(cssMobile.length).toBeGreaterThan(0)
    expect(new Set(cssMobile)).toEqual(new Set([normalise(MOBILE_QUERY)]))
  })

  it('uses the three weight tokens; only the wordmark may use 800', () => {
    const weight = /^(inherit|var\(--weight-(regular|medium|bold)\))$/
    expect(offenders(d => d.property === 'font-weight' && !weight.test(d.value) && !(d.value === '800' && /brand/.test(d.selector)))).toEqual([])
    expect(offenders(d => d.property === 'font' && /\b\d00\b|\b\d50\b/.test(d.value.replace(/var\(--[\w-]+\)/g, '')))).toEqual([])
  })

  it('has one focus ring: no outline removal except on programmatic focus targets', () => {
    // A heading or region focused by script (h1, the error summary, tabindex -1) needs no ring.
    // The Plan filter pills draw the ring around the pill, so their select inside has none.
    const allowed = /^(h1:focus|\.error-summary:focus|.*\[tabindex="-1"\].*|\.monthly-budget-page \.budget-v3-filter-select:focus-visible)$/
    expect(offenders(d => d.property === 'outline' && /^(none|0)$/.test(d.value) && !d.selector.split(',').every(s => allowed.test(s.trim())))).toEqual([])
    expect(offenders(d => d.property === 'outline' && /var\(--orange\)/.test(d.value))).toEqual([])
  })

  it('sizes controls with the control-height token, not one-off 40–48px heights', () => {
    expect(offenders(d => /^(min-)?height$/.test(d.property) && /^(40|42|46|48)px$/.test(d.value) && /\b(input|select|textarea|button)\b|-button\b/.test(d.selector) && !/mobile-bottom-nav/.test(d.selector))).toEqual([])
  })

  it('uses shadow tokens', () => {
    expect(offenders(d => d.property === 'box-shadow' && d.value !== 'none' && !/var\(--shadow-/.test(d.value) && !/var\(--line\)/.test(d.value))).toEqual([])
  })
})
