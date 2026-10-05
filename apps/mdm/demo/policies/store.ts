import { randomUUID } from 'node:crypto'
import { boolean, closed, enumeration, record, uuid } from '../../src/services/decode'
import {
  policyDefinition,
  type PolicyDefinition,
  type PolicyRead,
} from '../../src/features/policies/clients/model'
import type { DomainHandler, Reply } from '../scenario'
import { createReceipts, error, ok, operation } from '../http'
/** One authored Policy store and CAS/receipt owner for the explicit HTTP demo. */
export function createPolicyStore() {
  const rows = new Map<string, PolicyRead>(),
    managed = new Set<string>(),
    receipts = createReceipts()
  const validators = new Map<
    PolicyDefinition['action']['kind'],
    (definition: PolicyDefinition) => Reply | undefined
  >()
  function normalized(value: unknown, old?: PolicyRead) {
    const d = closed(value, ['scope', 'action'], ['selfService'])
    if ('selfService' in d) {
      const c = closed(
        d['selfService'],
        [
          'access',
          'published',
          'displayName',
          'description',
          'prerequisites',
          'sideEffects',
          'category',
          'keywords',
        ],
        ['allowAi', 'riskLevel'],
      )
      return policyDefinition({
        ...d,
        selfService: {
          ...c,
          allowAi: c['allowAi'] ?? old?.definition.selfService?.allowAi ?? true,
          riskLevel: c['riskLevel'] ?? old?.definition.selfService?.riskLevel ?? 2,
        },
      })
    }
    return policyDefinition(d)
  }
  function validate(d: PolicyDefinition) {
    const validator = validators.get(d.action.kind)
    return validator ? validator(d) : error('action_not_supported', 501)
  }
  // policy::Definition::semantic excludes self-service metadata and software rollout.
  function semantic(definition: PolicyDefinition) {
    const action =
      definition.action.kind === 'software'
        ? { ...definition.action, rollout: undefined }
        : definition.action
    return JSON.stringify(action, (_key, value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
        : value,
    )
  }
  function put(
    id: string,
    definition: PolicyDefinition,
    enabled: boolean,
    old?: PolicyRead,
  ): PolicyRead {
    const same = old && semantic(old.definition) === semantic(definition)
    const p = {
      id,
      definition: structuredClone(definition),
      enabled,
      revision: (old?.revision ?? 0) + 1,
      version: same ? old.version : (old?.version ?? 0) + 1,
      versionId: same ? old.versionId : randomUUID(),
    }
    rows.set(id, p)
    return p
  }
  const handle: DomainHandler = (request, scenario) => {
    if (request.path !== '/api/v1/policies' && !/^\/api\/v1\/policies\/[^/]+$/.test(request.path))
      return
    if (request.path.endsWith('/previews')) return
    try {
      if (scenario === 'denied') return error('permission_denied', 403)
      if (request.path === '/api/v1/policies' && request.method === 'GET') {
        const after = request.query.get('after'),
          action = request.query.get('action'),
          limit = Number(request.query.get('limit') ?? 64),
          descending = request.query.get('descending') === 'true'
        if (after) uuid(after)
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid limit')
        if (action)
          enumeration(action, [
            'execution',
            'native_collection',
            'configuration',
            'software',
            'ensure_agent_installed',
            'request_mdm_enrollment',
          ] as const)
        const enabled = request.query.get('enabled'),
          scope = request.query.get('scope'),
          resource = request.query.get('resource')
        if (enabled !== null && !['true', 'false'].includes(enabled))
          throw new Error('Invalid filter')
        if (scope) uuid(scope)
        const items = (scenario === 'empty' ? [] : [...rows.values()])
          .filter(
            (p) =>
              (!after || (descending ? p.id < after : p.id > after)) &&
              (!action || p.definition.action.kind === action) &&
              (enabled === null || p.enabled === (enabled === 'true')) &&
              (!scope || p.definition.scope === scope) &&
              (!resource ||
                ('resource' in p.definition.action &&
                  p.definition.action.resource.id === resource)),
          )
          .sort((a, b) => (a.id < b.id ? -1 : 1) * (descending ? -1 : 1))
        return ok({
          items: structuredClone(items.slice(0, limit)),
          nextCursor: items.length > limit ? items[limit - 1]!.id : null,
        })
      }
      const id = uuid(request.path.split('/').at(-1)),
        old = rows.get(id)
      if (request.method === 'GET')
        return old ? ok(structuredClone(old)) : error('policy_not_found', 404)
      if (request.method !== 'POST') return
      if (managed.has(id)) return error('permission_denied', 403)
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (op.expectedRevision !== (old?.revision ?? 0)) return error('operation_conflict')
        const input = record(op.input),
          action = enumeration(input['action'], ['put', 'enable', 'disable'] as const)
        if (action === 'put') {
          closed(input, ['action', 'definition', 'enabled'])
          const definition = normalized(input['definition'], old),
            failure = validate(definition)
          if (failure) return failure
          return ok(structuredClone(put(id, definition, boolean(input['enabled']), old)))
        }
        closed(input, ['action'])
        if (!old) return error('policy_not_found', 404)
        const failure = action === 'enable' ? validate(old.definition) : undefined
        if (failure) return failure
        return ok(structuredClone(put(id, old.definition, action === 'enable', old)))
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    register(
      kind: PolicyDefinition['action']['kind'],
      validator: (d: PolicyDefinition) => Reply | undefined,
    ) {
      validators.set(kind, validator)
    },
    get: (id: string) => rows.get(id),
    values: () => [...rows.values()],
    createManaged(definition: PolicyDefinition) {
      if (validate(definition)) throw new Error('Managed Policy unavailable')
      const p = put(randomUUID(), definition, true)
      managed.add(p.id)
      return { id: p.id, versionId: p.versionId }
    },
    disableManaged(id: string) {
      const p = rows.get(id)
      if (!p || !managed.has(id)) throw new Error('Wrong managed Policy')
      put(id, p.definition, false, p)
    },
    reset() {
      rows.clear()
      managed.clear()
      receipts.reset()
    },
  }
}
