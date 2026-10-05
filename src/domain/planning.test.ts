import { expect, it } from 'vitest'
import { defaultPlanning } from '../config/defaultPlanning'
import { validatePlanning } from './planning'

it('loads requested planning ages and fixed cash return', () => {
  expect(validatePlanning(defaultPlanning)).toBeUndefined()
  expect(defaultPlanning).toMatchObject({ fireAge: 50, pensionAccessAge: 58, horizonAge: 95, withdrawalRate: 0.035, cashReturn: 0 })
})
it.each([{ equityReturn: -1 }, { bondReturn: NaN }, { equityVolatility: -0.1 }, { horizonAge: 40 }, { pensionAccessAge: 58.5 }, { cashReturn: 0.01 }])('rejects invalid assumptions %j', invalid => {
  expect(validatePlanning({ ...defaultPlanning, ...invalid } as typeof defaultPlanning)).toBeTruthy()
})
