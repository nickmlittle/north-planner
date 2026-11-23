/* global URL, console */
// Fails the build if the review clock (src/reviewClock.ts) reached it. The clock is for local
// reviews only: its install sits behind a static `--mode localonly` check, so Vite drops it.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const dist = new URL('../dist/', import.meta.url).pathname
const markers = ['north.review.today', 'Review date:', 'review-clock']
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(join(dir, entry.name)) : /\.(js|html|css)$/.test(entry.name) ? [join(dir, entry.name)] : [])

const built = files(dist)
const leaks = built.flatMap(file => markers.filter(marker => readFileSync(file, 'utf8').includes(marker)).map(marker => `${file}: ${marker}`))
if (built.length === 0) {
  console.error('check-review-clock: dist/ has no built files to check.')
  process.exit(1)
}
if (leaks.length > 0) {
  console.error(`check-review-clock: the review clock is in the build:\n${leaks.join('\n')}`)
  process.exit(1)
}
console.log(`check-review-clock: not in the build (${built.length} files checked).`)
