const descriptor = (name, artifactMode) => Object.freeze({ name, artifactMode })

export const REAL_PHASES = Object.freeze([
  descriptor('main', 'production'),
  descriptor('password-change', 'production'),
  descriptor('account-status-self', 'production'),
  descriptor('roles', 'production'),
  descriptor('policies-write', 'production'),
  descriptor('settings-config', 'production'),
  descriptor('rate-limited', 'production'),
  descriptor('budget-exhausted', 'production'),
  descriptor('admin-down', 'production'),
  descriptor('primary-down', 'production'),
  descriptor('preview-isolation', 'demo-preview'),
])

export function realPhase(name) {
  const phase = REAL_PHASES.find((candidate) => candidate.name === name)
  if (phase === undefined) throw new Error(`unknown real browser phase: ${name}`)
  return phase
}

export function passedPhaseEvidence(name) {
  const phase = realPhase(name)
  return { name: phase.name, status: 'passed', artifactMode: phase.artifactMode }
}

export function failedPhaseEvidence(stage, classification, activePhaseName) {
  const phase = realPhase(activePhaseName)
  return { name: stage, status: 'failed', classification, artifactMode: phase.artifactMode }
}
