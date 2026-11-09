import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Keeps styles.css on its design tokens: raw values live only in the :root block at the top,
// and everything after it goes through var(--…). See the token pass in UX review §6.5.
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rootEnd = css.indexOf('\n}\n')
const rest = css.slice(rootEnd + 3)

/** `selector { property: value }` for every declaration after the token block, media queries included. */
const declarations = [...rest.matchAll(/([^{}]*)\{([^{}]*)\}/g)].flatMap(([, selector, body]) =>
  body!.split(';').flatMap(part => {
    const match = part.match(/^\s*([a-zA-Z-]+)\s*:\s*([\s\S]+?)\s*$/)
    return match && !match[1]!.startsWith('--') ? [{ selector: selector!.trim().replace(/\s+/g, ' '), property: match[1]!.toLowerCase(), value: match[2]! }] : []
  }))
const offenders = (test: (d: { property: string; value: string }) => boolean) =>
  declarations.filter(test).map(d => `${d.selector} { ${d.property}: ${d.value} }`)

describe('design tokens', () => {
  it('has one token block, at the top of the file', () => {
    expect(css.trimStart().startsWith(':root {')).toBe(true)
    expect(rest).not.toMatch(/(^|[}\s]):root\s*\{[^}]*--(?!page-|desktop-|grouped-)/)
  })

  it('uses colour tokens instead of colour literals', () => {
    expect(offenders(d => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b/i.test(d.value.replace(/var\(--[\w-]+\)/g, '')) && d.property !== 'white-space')).toEqual([])
  })

  it('uses radius tokens', () => {
    expect(offenders(d => d.property === 'border-radius' && !/^(0|50%|(var\(--radius-[a-z]+\)|0)( (var\(--radius-[a-z]+\)|0))*)$/.test(d.value))).toEqual([])
  })

  it('uses shadow tokens', () => {
    expect(offenders(d => d.property === 'box-shadow' && d.value !== 'none' && !/var\(--shadow-/.test(d.value) && !/var\(--line\)/.test(d.value))).toEqual([])
  })
})
