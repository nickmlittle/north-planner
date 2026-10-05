import { useState } from 'react'
import { loadDefaultHousehold } from '../config/defaultHousehold'

export function useHousehold() {
  const [household] = useState(loadDefaultHousehold)
  return household
}
