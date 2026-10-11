export function DocumentConflict({ onChoose }: { onChoose: (choice: 'cloud' | 'device') => void }) {
  return <main className="account-screen" role="dialog" aria-labelledby="conflict-title">
    <p className="eyebrow">Two saved versions</p><h1 id="conflict-title">Which household should we keep?</h1>
    <p className="page-description">This account already has a saved household, and this browser also has a different draft.</p>
    <div className="button-row"><button className="secondary-button" onClick={() => onChoose('cloud')}>Use account version</button><button className="primary-button" onClick={() => onChoose('device')}>Replace it with this device</button></div>
  </main>
}
