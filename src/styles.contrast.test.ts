import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Locks text contrast into CI. Colours are read from the :root tokens in styles.css, and
// styles.tokens.test.ts keeps colour literals out of the rest of the file, so new colours land here.
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const rootBlock = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map(match => match[1]).join(';')
const token = (name: string) => {
  const value = rootBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
  if (!value) throw new Error(`Missing colour token --${name}`)
  return value
}

const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(index => channel(parseInt(hex.slice(index, index + 2), 16)))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

// Every surface text sits on, and every text colour, comes from a :root token.
const surfaces = ['cream', 'card', 'white', 'surface-field', 'surface-subtle', 'surface-header', 'surface-band', 'soft-fern', 'status-error-bg', 'status-review-bg']
const text = ['charcoal', 'pine', 'muted', 'link', 'status-ok', 'status-error', 'status-review']

describe('text contrast (WCAG AA, 4.5:1)', () => {
  for (const foreground of text) {
    for (const background of surfaces) {
      it(`${foreground} on ${background}`, () => expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(4.5))
    }
  }
  it('white on pine (primary buttons)', () => expect(contrast(token('white'), token('pine'))).toBeGreaterThanOrEqual(4.5))
  it('white on pine-strong (primary hover)', () => expect(contrast(token('white'), token('pine-strong'))).toBeGreaterThanOrEqual(4.5))
  it('white on danger (destructive buttons)', () => expect(contrast(token('white'), token('danger'))).toBeGreaterThanOrEqual(4.5))
  it('cream on pine (sidebar)', () => expect(contrast(token('cream'), token('pine'))).toBeGreaterThanOrEqual(4.5))
  it('on-pine-muted on pine (phone nav labels, header note)', () => expect(contrast(token('on-pine-muted'), token('pine'))).toBeGreaterThanOrEqual(4.5))
})
