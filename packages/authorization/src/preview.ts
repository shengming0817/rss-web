import { createAuthorizationPort, type AuthorizationPort } from './port'
import { authorizationIntentKey, isExactRecord } from './intent'
import type { AuthorizationDecision, AuthorizationIntent, PreviewAuthorizationHint } from './types'

export interface PreviewAuthorizationScenario {
  readonly id: string
  readonly intent: AuthorizationIntent
  readonly decision: AuthorizationDecision
}

export interface PreviewAuthorizationOptions {
  readonly enabled: true
  readonly scenarios: readonly PreviewAuthorizationScenario[]
}

const SCENARIO_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const DECISIONS: ReadonlySet<AuthorizationDecision> = new Set(['allow', 'deny', 'unknown'])

function unmatched(): PreviewAuthorizationHint {
  return Object.freeze({
    decision: 'unknown',
    source: Object.freeze({
      kind: 'preview',
      authoritative: false,
      reason: 'unmatched',
    }),
  })
}

function scenarioHint(
  scenario: Pick<PreviewAuthorizationScenario, 'id' | 'decision'>,
): PreviewAuthorizationHint {
  return Object.freeze({
    decision: scenario.decision,
    source: Object.freeze({
      kind: 'preview',
      authoritative: false,
      reason: 'scenario',
      scenarioId: scenario.id,
    }),
  })
}

export function createPreviewAuthorizationPort(
  options: PreviewAuthorizationOptions,
): AuthorizationPort {
  if (
    !isExactRecord(options, ['enabled', 'scenarios']) ||
    options.enabled !== true ||
    !Array.isArray(options.scenarios)
  ) {
    throw new Error('Preview authorization must be explicitly enabled with exact options')
  }

  const scenarios = new Map<string, PreviewAuthorizationHint>()
  const scenarioIds = new Set<string>()
  const invalidated = new Set<string>()
  for (const scenario of options.scenarios) {
    if (!isExactRecord(scenario, ['id', 'intent', 'decision'])) {
      throw new Error('Preview authorization scenario must have an exact shape')
    }
    const key = authorizationIntentKey(scenario.intent)
    if (
      typeof scenario.id !== 'string' ||
      !SCENARIO_ID.test(scenario.id) ||
      key === undefined ||
      typeof scenario.decision !== 'string' ||
      !DECISIONS.has(scenario.decision as AuthorizationDecision)
    ) {
      throw new Error('Preview authorization scenario has an invalid exact selector')
    }
    if (scenarioIds.has(scenario.id)) {
      throw new Error('Preview authorization scenario id must be unique')
    }
    if (scenarios.has(key)) {
      throw new Error('Preview authorization selector must be unique')
    }
    scenarioIds.add(scenario.id)
    scenarios.set(
      key,
      scenarioHint({
        id: scenario.id,
        decision: scenario.decision as AuthorizationDecision,
      }),
    )
  }

  return createAuthorizationPort(
    (intent) => {
      const key = authorizationIntentKey(intent)
      return key === undefined || invalidated.has(key)
        ? unmatched()
        : (scenarios.get(key) ?? unmatched())
    },
    {
      invalidate(intent) {
        const key = authorizationIntentKey(intent)
        if (key !== undefined && scenarios.has(key)) invalidated.add(key)
      },
      reset() {
        invalidated.clear()
      },
    },
  )
}

export type { AuthorizationDecision, AuthorizationIntent } from './types'
