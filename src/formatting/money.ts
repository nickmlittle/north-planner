export function formatGBP(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value)
}

const wholeGBP = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
export function formatGBPWhole(value: number): string {
  return `£${wholeGBP.format(value)}`
}
export function formatGBPSummary(value: number): string {
  if (Math.abs(value) < 1_000_000) return formatGBPWhole(value)
  return `£${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(value / 1_000_000)}m`
}
export function formatGBPAnnual(value: number): string {
  return `${formatGBPWhole(value)}/yr`
}
export function formatGBPAxis(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `£${new Intl.NumberFormat('en-GB', { maximumFractionDigits: abs >= 10_000_000 ? 0 : 1 }).format(value / 1_000_000)}m`
  if (abs >= 1_000) return `£${new Intl.NumberFormat('en-GB', { maximumFractionDigits: abs >= 100_000 ? 0 : 1 }).format(value / 1_000)}k`
  return formatGBPWhole(value)
}
