const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

export function formatGBP(value: number): string {
  return gbp.format(value)
}
