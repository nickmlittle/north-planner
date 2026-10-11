import type { AppDocument } from '../domain/setup'
import { toForecastInput } from '../domain/setup'
import { forecastResult } from '../engine/forecast'
import { dashboardMetrics } from '../engine/dashboard'

export function documentForecast(doc: AppDocument) {
  try {
    const input = toForecastInput(doc)
    const result = forecastResult(input)
    return { input, result, metrics: result.error ? undefined : dashboardMetrics(input, result.rows) }
  } catch (e) {
    return { input: undefined, result: { rows: [], error: e instanceof Error ? e.message : 'Complete household details before forecasting.' }, metrics: undefined }
  }
}
