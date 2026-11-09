import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Locks today's passing contrast into CI before the design-token refactor changes colours.
// Tokens are read from styles.css so a token edit is checked; literal backgrounds are the
// surfaces those tokens actually sit on today.
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

const STATUS_RED = '#a54232'
const surfaces = {
  cream: () => token('cream'),
  card: () => token('card'),
  page: () => '#f7f8f4',
  'inline editor': () => '#f5f7f2',
  'group band': () => '#e7eee6',
  'table header': () => '#f2f5ef',
  'warning': () => '#fbf0ed',
}
const text = { charcoal: () => token('charcoal'), pine: () => token('pine'), muted: () => token('muted'), 'status red': () => STATUS_RED }

describe('text contrast (WCAG AA, 4.5:1)', () => {
  for (const [textName, foreground] of Object.entries(text)) {
    for (const [surfaceName, background] of Object.entries(surfaces)) {
      it(`${textName} on ${surfaceName}`, () => expect(contrast(foreground(), background())).toBeGreaterThanOrEqual(4.5))
    }
  }
  it('white on pine (primary buttons)', () => expect(contrast('#ffffff', token('pine'))).toBeGreaterThanOrEqual(4.5))
  it('white on danger (destructive buttons)', () => expect(contrast('#ffffff', '#963c34')).toBeGreaterThanOrEqual(4.5))
})
