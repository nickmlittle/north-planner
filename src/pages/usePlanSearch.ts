import { useRef, useState } from 'react'
import type { PlanDestination } from '../state/navigation'

type BrowsePosition = { top: number; left: number; page: boolean; month: string; destination: string }

const pageBody = () => window.document.querySelector<HTMLElement>('.monthly-budget-page>.page-frame-body')

/**
 * The Plan search text. Starting a search remembers where you were browsing; clearing it
 * takes you back there, as long as the month and destination haven't changed meanwhile.
 */
export function usePlanSearch({ month, planDestination, mobilePresentation }: { month: string; planDestination?: PlanDestination | null; mobilePresentation: boolean }) {
  const [query, setQuery] = useState('')
  const browseScroll = useRef<BrowsePosition | null>(null)
  const destination = planDestination ? `${planDestination.kind}:${planDestination.id}` : ''

  const captureBrowseScroll = () => {
    if (query.trim() || browseScroll.current) return
    const body = pageBody()
    const page = mobilePresentation || !body || getComputedStyle(body).overflowY === 'visible'
    browseScroll.current = { top: page ? window.scrollY : body.scrollTop, left: page ? window.scrollX : body.scrollLeft, page, month, destination }
  }

  const updateSearch = (value: string) => {
    if (!query.trim() && value.trim()) captureBrowseScroll()
    setQuery(value)
    if (!query.trim() || value.trim() || !browseScroll.current) return
    const position = browseScroll.current
    browseScroll.current = null
    if (position.month !== month || position.destination !== destination) return
    window.requestAnimationFrame(() => {
      if (position.page) { window.scrollTo(position.left, position.top); return }
      const body = pageBody()
      if (body) { body.scrollTop = position.top; body.scrollLeft = position.left }
    })
  }

  return { query, updateSearch, captureBrowseScroll }
}
