import { startingPositionGroups } from '../config/startingPositionFields'
import type { Household } from '../domain/models'
import { getStartingPositionValue } from '../domain/startingPosition'
import type { StartingPositionField } from '../domain/startingPosition'
import { StartingPositionInput } from './StartingPositionInput'

export function StartingPosition({ household, onChange }: {
  household: Household
  onChange: (field: StartingPositionField, raw: string) => string | undefined
}) {
  return (
    <section className="household-card" aria-labelledby="starting-position-heading">
      <h2 id="starting-position-heading">Starting position</h2>
      <p>Valid edits apply immediately. Changes are kept for this session and reset on reload.</p>
      {startingPositionGroups.map(group => (
        <fieldset key={group.name}>
          <legend>{group.name}</legend>
          <div className="input-grid">
            {group.inputs.map(definition => (
              <StartingPositionInput key={definition.key} definition={definition}
                value={getStartingPositionValue(household, definition.field)}
                priceYear={household.assumptions.moneyBasis.priceYear}
                onChange={raw => onChange(definition.field, raw)} />
            ))}
          </div>
        </fieldset>
      ))}
    </section>
  )
}
