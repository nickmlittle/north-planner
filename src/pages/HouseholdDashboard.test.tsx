// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { HouseholdDashboard } from './HouseholdDashboard'
import type { AppDocument } from '../domain/setup'
import { completeDocument } from '../test/setupFixture'

afterEach(cleanup)

function Harness({ initial }: { initial: AppDocument }) {
  const [document, setDocument] = useState(initial)
  return <HouseholdDashboard document={document} setDocument={setDocument} warning="" replaceSavedDraft={() => {}} onSelectSettings={() => {}} onSelectView={() => {}} />
}

it('prioritizes current and work-optional net worth with supporting horizon context', () => {
  const doc = completeDocument()
  doc.spendingEvents = [2028, 2029, 2030, 2031].map((year, index) => ({ id: `milestone-${index}`, name: `Plan checkpoint ${index + 1}`, startYear: year, endYear: year, annualChange: 0, enabled: false }))
  render(<Harness initial={doc} />)
  expect(screen.getByRole('heading', { name: 'Net worth today' })).toBeVisible()
  expect(screen.getByRole('heading', { name: /Projected net worth · work optional \d{4}/ })).toBeVisible()
  expect(screen.getByText('Indicative annual withdrawal')).toBeVisible()
  expect(screen.getByText('Funding horizon')).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Plan funding' })).not.toBeInTheDocument()
  expect(document.querySelectorAll('.milestone-list li')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: /Show all .* milestones/ }))
  expect(document.querySelectorAll('.milestone-list li')).toHaveLength(6)
})
