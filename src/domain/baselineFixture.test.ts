import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { decodeBudgetDocument } from './budgetDocument'
import { buildTransferInstructions } from './transferInstructions'

it('keeps the reusable UX baseline fixture valid and financially reconciled', () => {
  const raw = JSON.parse(readFileSync(new URL('../../docs/fixtures/plan-transfers-baseline.json', import.meta.url), 'utf8'))
  const document = decodeBudgetDocument(raw)
  expect(document).not.toBeNull()
  if (!document) return
  expect(document.budget.snapshots['2026-10']?.items).toHaveLength(40)
  const instructions = buildTransferInstructions(document, '2026-11')
  expect(instructions.incomplete).toBe(false)
  expect(instructions.totals.plannedPence).toBe(764187)
  expect(instructions.totals.allocatedFundingPence).toBe(764187)
  expect(instructions.accounts.find(account => account.accountId === 'joint')?.fundingRequirements.reduce((sum, step) => sum + step.amountPence, 0)).toBe(376772)
})
