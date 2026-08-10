import { createAuthorizationPort, type AuthorizationPort } from './port'
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

const CONTRACT_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const SCENARIO_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const DECISIONS: ReadonlySet<AuthorizationDecision> = new Set(['allow', 'deny', 'unknown'])

function isExactRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false

  const keys = Reflect.ownKeys(value)
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys])
  return (
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => typeof key === 'string' && allowedKeys.has(key))
  )
}

function validPermission(value: unknown): value is string {
  const hasUnsafeCharacter =
    typeof value === 'string' &&
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return character === '*' || /\s/u.test(character) || codePoint <= 31 || codePoint === 127
    })

  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    !hasUnsafeCharacter
  )
}

function validIntent(intent: unknown): intent is AuthorizationIntent {
  return (
    isExactRecord(intent, ['contractId', 'permission'], ['resourceId']) &&
    typeof intent.contractId === 'string' &&
    CONTRACT_ID.test(intent.contractId) &&
    validPermission(intent.permission) &&
    (intent.resourceId === undefined ||
      (typeof intent.resourceId === 'string' &&
        intent.resourceId.length > 0 &&
        intent.resourceId === intent.resourceId.trim()))
  )
}

function selector(intent: unknown): string | undefined {
  if (!validIntent(intent)) return undefined
  return JSON.stringify([intent.contractId, intent.permission, intent.resourceId ?? null])
}

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
  for (const scenario of options.scenarios) {
    if (!isExactRecord(scenario, ['id', 'intent', 'decision'])) {
      throw new Error('Preview authorization scenario must have an exact shape')
    }
    const key = selector(scenario.intent)
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

  return createAuthorizationPort((intent) => {
    const key = selector(intent)
    return key === undefined ? unmatched() : (scenarios.get(key) ?? unmatched())
  })
}

export type { AuthorizationDecision, AuthorizationIntent } from './types'
