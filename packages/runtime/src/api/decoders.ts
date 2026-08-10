import {
  PLACEMENT_MODES,
  PLACEMENT_READINESS,
  PROVIDER_POSTURE_STATES,
  RUNTIME_AUTH_SCHEMES,
  RUNTIME_DOMAINS,
  RUNTIME_LISTENER_KINDS,
  WORKFLOW_ACTIVATIONS,
  type ActivatedWorkflow,
  type ProviderPostureState,
  type RuntimeAuthScheme,
  type RuntimeBuildMetadata,
  type RuntimeDomain,
  type RuntimeInventoryResponse,
  type RuntimeListener,
  type RuntimeListenerKind,
  type RuntimePlacement,
  type RuntimeProviderPosture,
} from './types'

const FINGERPRINT = /^sha256:[0-9a-f]{64}$/
const REVISION = /^([0-9a-f]{40}|[0-9a-f]{64})$/
const VERSION = /^v[0-9]+$/
const DOMAINS = new Set<RuntimeDomain>(RUNTIME_DOMAINS)
const LISTENER_KINDS = new Set<RuntimeListenerKind>(RUNTIME_LISTENER_KINDS)
const AUTH_SCHEMES = new Set<RuntimeAuthScheme>(RUNTIME_AUTH_SCHEMES)
const POSTURES = new Set<ProviderPostureState>(PROVIDER_POSTURE_STATES)

function invalid(): never {
  throw new Error('invalid runtime inventory response')
}

function record(value: unknown, required: readonly string[], optional: readonly string[] = []) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid()
  const result = value as Record<string, unknown>
  const keys = Object.keys(result)
  if (required.some((key) => !Object.hasOwn(result, key))) invalid()
  if (keys.some((key) => !required.includes(key) && !optional.includes(key))) invalid()
  return result
}

function text(value: unknown, pattern?: RegExp): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    (pattern !== undefined && !pattern.test(value))
  )
    invalid()
  return value
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>): T {
  const candidate = text(value) as T
  if (!values.has(candidate)) invalid()
  return candidate
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid()
  return value
}

function uniqueBy<T>(values: readonly T[], keyOf: (value: T) => string): readonly T[] {
  const keys = values.map(keyOf)
  if (new Set(keys).size !== keys.length) invalid()
  return values
}

function endpoint(value: unknown): void {
  const item = record(value, ['scheme', 'host', 'port'])
  const scheme = enumValue(item.scheme, new Set(['http', 'https'] as const))
  const host = text(item.host)
  const port = item.port
  if (
    host.length > 253 ||
    typeof port !== 'number' ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    invalid()
  void scheme
}

function buildMetadata(value: unknown): RuntimeBuildMetadata {
  const item = record(value, ['sourceRevision', 'imageDigest'])
  return {
    sourceRevision: text(item.sourceRevision, REVISION),
    imageDigest: text(item.imageDigest, FINGERPRINT),
  }
}

function workflow(value: unknown): ActivatedWorkflow {
  const item = record(value, [
    'mode',
    'id',
    'definitionVersion',
    'definitionSchemaDigest',
    'activation',
  ])
  const common = {
    id: text(item.id),
    definitionVersion: text(item.definitionVersion, VERSION),
    definitionSchemaDigest: text(item.definitionSchemaDigest, FINGERPRINT),
  }
  if (item.mode === 'projection') {
    const activation = enumValue(item.activation, new Set(WORKFLOW_ACTIVATIONS.projection))
    return { mode: 'projection', ...common, activation }
  }
  if (item.mode === 'saga') {
    const activation = enumValue(item.activation, new Set(WORKFLOW_ACTIVATIONS.saga))
    return { mode: 'saga', ...common, activation }
  }
  return invalid()
}

function listener(value: unknown): RuntimeListener {
  const item = record(value, ['id', 'kind', 'endpoint', 'authScheme'])
  endpoint(item.endpoint)
  return {
    id: text(item.id),
    kind: enumValue(item.kind, LISTENER_KINDS),
    authScheme: enumValue(item.authScheme, AUTH_SCHEMES),
  }
}

function posture(value: unknown): RuntimeProviderPosture {
  const item = record(value, ['id', 'state'])
  return { id: text(item.id), state: enumValue(item.state, POSTURES) }
}

function placement(value: unknown): RuntimePlacement {
  const item = record(
    value,
    ['domain', 'workload', 'mode', 'readiness'],
    ['endpoint', 'spiffeIdentity'],
  )
  const mode = enumValue(item.mode, new Set(PLACEMENT_MODES))
  const readiness = enumValue(item.readiness, new Set(PLACEMENT_READINESS))
  if (item.endpoint !== undefined) endpoint(item.endpoint)
  if (item.spiffeIdentity !== undefined) text(item.spiffeIdentity)
  return {
    domain: enumValue(item.domain, DOMAINS),
    workload: text(item.workload),
    mode,
    readiness,
  }
}

export function decodeRuntimeInventoryResponse(value: unknown): RuntimeInventoryResponse {
  const envelope = record(value, ['data'])
  const data = record(
    envelope.data,
    [
      'schemaVersion',
      'assemblyFingerprint',
      'runtimePlanFingerprint',
      'activatedWorkflows',
      'domains',
      'listeners',
      'providerPosture',
      'placements',
    ],
    ['buildMetadata'],
  )
  if (data.schemaVersion !== 1) invalid()
  const domains = uniqueBy(
    array(data.domains).map((item) => enumValue(item, DOMAINS)),
    (domain) => domain,
  )
  if (domains.length === 0) invalid()
  return {
    data: {
      schemaVersion: 1,
      assemblyFingerprint: text(data.assemblyFingerprint, FINGERPRINT),
      ...(data.buildMetadata === undefined
        ? {}
        : { buildMetadata: buildMetadata(data.buildMetadata) }),
      runtimePlanFingerprint: text(data.runtimePlanFingerprint, FINGERPRINT),
      activatedWorkflows: uniqueBy(
        array(data.activatedWorkflows).map(workflow),
        (item) => `${item.mode}:${item.id}`,
      ),
      domains,
      listeners: uniqueBy(array(data.listeners).map(listener), (item) => item.id),
      providerPosture: uniqueBy(array(data.providerPosture).map(posture), (item) => item.id),
      placements: uniqueBy(
        array(data.placements).map(placement),
        (item) => `${item.domain}:${item.workload}`,
      ),
    },
  }
}
