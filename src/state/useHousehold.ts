import { useState } from 'react'
import { loadDefaultHousehold } from '../config/defaultHousehold'
import { updateStartingPosition } from '../domain/startingPosition'
import type { StartingPositionField } from '../domain/startingPosition'

export function useHousehold() {
  const [household, setHousehold] = useState(loadDefaultHousehold)
  function update(field: StartingPositionField, raw: string): string | undefined {
    const result = updateStartingPosition(household, field, raw)
    if (!result.error) setHousehold(result.household)
    return result.error
  }
  return { household, update }
}
