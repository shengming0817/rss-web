/** MOCK_SOURCE: explicit synthetic profiles; never authentication evidence. */
import { directoryPage } from './directory'
import { randomUUID } from 'node:crypto'
import { type DomainHandler } from './scenario'
import { ADMIN as PRINCIPAL } from './operations/authorization'
import { closed, count, uuid } from '../src/services/decode'
import {
  definitionValue,
  type Definition,
  type ProfileSource,
} from '../src/features/settings/clients/profiles'
import { error, ok } from './http'
export const demoProfile = {
  displayName: 'Demo profile',
  username: 'demo',
  email: 'demo@example.test',
  emailVerified: null,
  extensions: { employeeNumber: 'DEMO-001', remote: false, allocation: 0 },
}
export function createProfilesDemo() {
  const definitions = new Map<string, Definition>(),
    operations = new Map<string, { input: string; receipt: unknown }>()
  const source: ProfileSource = { kind: 'identity_local' }
  const snapshot = randomUUID(),
    observed = Math.floor(Date.now() / 1000)
  const handle: DomainHandler = (r, scenario) => {
    if (!/^\/api\/v1\/(user-attribute|user-profiles)/.test(r.path)) return
    const admin = r.actor.principalId === PRINCIPAL
    if (r.path === '/api/v1/user-attribute-definitions' && r.method === 'GET')
      return admin
        ? ok({
            ...directoryPage(
              [...definitions.values()].filter((v) => v.value !== null),
              r,
              ['fieldId'],
              { maxLimit: 128 },
            ),
            sources: [
              {
                source,
                providerConfigVersion: null,
                extensionsRoot: 'extensions',
                maxAgeSeconds: 14400,
              },
            ],
          })
        : error('permission_denied', 403)
    const operation = /^\/api\/v1\/user-attribute-operations\/([^/]+)$/.exec(r.path)
    if (operation)
      return admin
        ? operations.has(operation[1]!)
          ? ok(operations.get(operation[1]!)!.receipt)
          : error('not_found', 404)
        : error('permission_denied', 403)
    const field = /^\/api\/v1\/user-attribute-definitions\/([^/]+)$/.exec(r.path)
    if (field) {
      if (!admin) return error('permission_denied', 403)
      const id = uuid(field[1])
      if (r.method === 'GET')
        return definitions.has(id) ? ok(definitions.get(id)) : error('not_found', 404)
      if (r.method !== 'PUT') return error('action_not_supported', 501)
      const v = closed(r.body, ['operationId', 'expectedRevision', 'value']),
        op = uuid(v['operationId']),
        input = JSON.stringify([id, v]),
        old = operations.get(op)
      if (old) return old.input === input ? ok(old.receipt) : error('operation_conflict')
      if (count(v['expectedRevision']) !== (definitions.get(id)?.revision ?? 0))
        return error('operation_conflict')
      const value = v['value'] === null ? null : definitionValue(v['value'])
      const definition = {
        fieldId: id,
        revision: count(v['expectedRevision']) + 1,
        collectedAfterMicros: value?.useExistingObservation ? 0 : Date.now() * 1000,
        value,
      }
      definitions.set(id, definition)
      const receipt = { operationId: op, definition }
      operations.set(op, { input, receipt })
      return scenario === 'unknown' ? error('operation_unknown', 503) : ok(receipt)
    }
    const person = /^\/api\/v1\/user-profiles\/(me|[^/]+)$/.exec(r.path)
    if (person && r.method === 'GET') {
      const own = person[1] === 'me' || person[1] === r.actor.principalId,
        preview = r.query.get('preview') === 'true'
      if ((!own || preview) && !admin) return error('permission_denied', 403)
      const document = demoProfile
      const fields = [...definitions.values()].flatMap((d) => {
        const v = d.value
        if (
          !v ||
          !v.enabled ||
          !(v.visibility === 'both' ? own || admin : v.visibility === 'self' ? own : admin)
        )
          return []
        let value: unknown = document
        if (v.pointer !== '')
          for (const part of v.pointer.slice(1).split('/')) {
            const key = part.replaceAll('~1', '/').replaceAll('~0', '~')
            value =
              typeof value === 'object' && value !== null && Object.hasOwn(value, key)
                ? Reflect.get(value, key)
                : undefined
          }
        const status =
          d.collectedAfterMicros > observed * 1000000
            ? 'pending_login'
            : value === undefined || value === null
              ? 'missing'
              : preview && v.sensitive
                ? 'redacted'
                : 'available'
        return [
          {
            fieldId: d.fieldId,
            revision: d.revision,
            key: v.key,
            displayName: v.displayName,
            source: v.source,
            valueType: v.valueType,
            sensitive: v.sensitive,
            displayUse: v.displayUse,
            required: v.required,
            status,
            value: status === 'available' ? value : null,
          },
        ]
      })
      const required = fields.filter((f) => f.required).length,
        complete = fields.filter(
          (f) => f.required && ['available', 'redacted'].includes(f.status),
        ).length
      return ok({
        principalId: own ? r.actor.principalId : uuid(person[1]),
        view: own ? (r.query.get('view') ?? 'current') : 'latest',
        profiles: [
          {
            source,
            status: 'available',
            snapshotId: snapshot,
            providerConfigVersion: null,
            sourceRevision: 1,
            observedAt: observed,
            collectedAtMicros: observed * 1000000,
            expiresAt: observed + 14400,
            fixed: preview
              ? null
              : {
                  displayName: { status: 'available', value: document.displayName },
                  username: { status: 'available', value: 'demo' },
                  email: { status: 'available', value: document.email },
                  emailVerified: { status: 'missing' },
                },
          },
        ],
        fields,
        completeness: { required, complete, missing: required - complete },
      })
    }
  }
  return {
    handle,
    reset() {
      definitions.clear()
      operations.clear()
    },
  }
}
