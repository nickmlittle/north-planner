const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "24 Nov" from YYYY-MM-DD. */
export function shortDate(date: string): string {
  return `${Number(date.slice(8))} ${months[Number(date.slice(5, 7)) - 1]}`
}
/** "Mon 9 Nov" from YYYY-MM-DD. */
export function dayDate(date: string): string {
  return `${weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${shortDate(date)}`
}
/** "Mon" from YYYY-MM-DD. */
export const weekday = (date: string) => weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()]!
