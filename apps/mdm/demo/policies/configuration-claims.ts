import { randomUUID, createHash } from 'node:crypto'
import {
  array,
  closed,
  enumeration,
  identifier,
  nullable,
  record,
  string,
} from '../../src/services/decode'
import type { createDeviceDemo } from '../devices/state'
import type { createResourceDemo } from './resources'
import type { createScopeDemo } from './scopes'
import type { createPolicyStore } from './store'
import { resourceApplicability, type ConfigurationEffects } from './applicability'
import type { ConfigurationDefinition } from '../../src/features/policies/clients/model'
import { error, ok } from '../http'
import type { DomainHandler } from '../scenario'
/** Synthetic native claims consume the one Policy store and verified Resource artifact. */
export function createConfigurationPolicies(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  scopes: Pick<ReturnType<typeof createScopeDemo>, 'resolve' | 'snapshot'>,
  resources: Pick<ReturnType<typeof createResourceDemo>, 'read' | 'content'>,
  store: ReturnType<typeof createPolicyStore>,
) {
  function selected(d: ConfigurationDefinition) {
    const b = d.action.resource,
      r = resources.read(b.id),
      v = r?.versions.find((v) => v.id === b.version && v.state === 'active'),
      variant = v?.variants.find(
        (v) =>
          v.key === b.variant && v.platform === b.platform && v.architecture === b.architecture,
      ),
      bytes = resources.content(b)
    if (r?.kind !== 'configuration' || variant?.declaration.kind !== 'configuration' || !bytes)
      return null
    const native = closed(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), [
        'target',
        'apply',
        'remove',
      ]),
      targetKind = enumeration(record(native['target'])['kind'], ['device', 'user'] as const),
      target = closed(native['target'], targetKind === 'user' ? ['kind', 'userId'] : ['kind']),
      user = targetKind === 'user' ? identifier(target['userId']) : ''
    function effects(value: unknown) {
      const task = closed(value, ['platform', 'request'])
      if (task['platform'] !== b.platform) throw new Error('Wrong native platform')
      const request = record(task['request'])
      if (b.platform === 'windows') {
        closed(request, ['kind', 'request'])
        enumeration(request['kind'], ['sync_ml'] as const)
        const rows: ConfigurationEffects['settings'] = []
        function visit(value: unknown, depth = 0) {
          if (depth > 32) throw new Error('Native tree too deep')
          const kind = enumeration(record(value)['kind'], ['node', 'atomic', 'sequence'] as const)
          if (kind !== 'node') {
            const v = closed(value, ['kind', 'operations'])
            array(v['operations'], (v) => visit(v, depth + 1))
            return
          }
          const v = closed(value, ['kind', 'node', 'instance', 'operation', 'value']),
            instance = array(v['instance'], string)
          let index = 0
          const key = identifier(v['node']).replace(/\*/g, () =>
            encodeURIComponent(instance[index++]!),
          )
          if (index !== instance.length || instance.some((v) => !v) || key.includes('undefined'))
            throw new Error('Invalid native identity')
          enumeration(v['operation'], ['add', 'replace', 'delete'] as const)
          const literal = nullable(v['value'], (v) => {
            const typed = closed(v, ['type', 'value'])
            enumeration(typed['type'], [
              'boolean',
              'integer',
              'text',
              'xml',
              'bytes',
              'admx',
              'time',
            ] as const)
            const type = typed['type'],
              raw = typed['value']
            if (type === 'boolean' && typeof raw !== 'boolean') throw new Error('Invalid boolean')
            if (type === 'integer' && (typeof raw !== 'string' || !/^-?\d+$/.test(raw)))
              throw new Error('Invalid integer')
            if (['text', 'xml', 'time'].includes(String(type)) && typeof raw !== 'string')
              throw new Error('Invalid string')
            return type === 'integer' && Number.isSafeInteger(Number(raw))
              ? Number(raw)
              : typeof raw === 'string' || typeof raw === 'boolean'
                ? raw
                : JSON.stringify(raw)
          })
          rows.push({ key: `${user ? `user/${user}/` : ''}${key}`, value: literal ?? '' })
        }
        visit(request['request'])
        return rows
      }
      enumeration(request['kind'], ['install_profile', 'remove_profile', 'declarations'] as const)
      if (request['kind'] === 'install_profile') {
        closed(request, ['kind', 'profile'])
        const profile = closed(request['profile'], ['identifier', 'uuid', 'metadata', 'payloads'])
        return [
          {
            key: `${user ? `user/${user}/` : ''}profile/${identifier(profile['identifier'])}`,
            value: JSON.stringify(profile),
          },
          ...array(profile['payloads'], (v) => {
            const payload = record(v)
            return {
              key: `${user ? `user/${user}/` : ''}payload/${identifier(payload['identifier'])}`,
              value: JSON.stringify(payload),
            }
          }),
        ]
      }
      if (request['kind'] === 'remove_profile') {
        closed(request, ['kind', 'identifier', 'uuid'])
        return [
          {
            key: `${user ? `user/${user}/` : ''}profile/${identifier(request['identifier'])}`,
            value: '',
          },
        ]
      }
      closed(request, ['kind', 'declarations', 'assets'])
      return array(request['declarations'], (value) => {
        const v = record(value)
        return {
          key: `${user ? `user/${user}/` : ''}declaration/${identifier(v['identifier'])}`,
          value: JSON.stringify(v),
        }
      })
    }
    const settings = effects(native['apply'])
    if (!settings.length) throw new Error('Empty native configuration')
    if (
      native['remove'] !== null &&
      effects(native['remove']).some((s) => !settings.some((a) => a.key === s.key))
    )
      throw new Error('Removal outside native ownership')
    if (d.action.exit === 'remove' && native['remove'] === null) return null
    return {
      resource: r,
      settings,
      removable: native['remove'] !== null,
      signature: createHash('sha256')
        .update(
          JSON.stringify([b.platform, user, native['apply']], (_key, v: unknown) =>
            v && typeof v === 'object' && !Array.isArray(v)
              ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
              : v,
          ),
        )
        .digest('hex'),
    }
  }
  store.register('configuration', (d) => {
    if (d.action.kind !== 'configuration') return error('malformed_request', 400)
    if (!scopes.resolve(d.scope)) return error('scope_not_found', 404)
    return selected({ ...d, action: d.action }) ? undefined : error('resource_not_found', 404)
  })
  function claims(replacedPolicy?: string) {
    return store.values().flatMap((p) => {
      if (!p.enabled || p.id === replacedPolicy || p.definition.action.kind !== 'configuration')
        return []
      const d = { ...p.definition, action: p.definition.action },
        selection = selected(d)
      if (!selection) return []
      return (scopes.resolve(d.scope)?.members ?? []).flatMap((device) => {
        const fact = devices.facts().find((v) => v.summary.id === device)
        if (
          resourceApplicability(selection.resource, d.action.resource.version, fact) !==
            'applicable' ||
          fact?.summary.platform !== d.action.resource.platform ||
          fact.architecture !== d.action.resource.architecture
        )
          return []
        const registrations = fact.registrations.filter(
          (r) => r.status === 'active' && r.source.startsWith('mdm.'),
        )
        if (registrations.length !== 1) return []
        const identity = registrations[0]!
        return [
          {
            p,
            device,
            definition: d,
            selection,
            identity: JSON.stringify([identity.registrationId, identity.generation]),
          },
        ]
      })
    })
  }
  type Claim = ReturnType<typeof claims>[number]
  const publications = new Map<
    string,
    { owners: Claim[]; operationId: string; action: 'apply' | 'retain' | 'remove' }
  >()
  const overlap = (a: Claim, b: Claim) =>
    a.device === b.device &&
    a.identity === b.identity &&
    a.definition.action.resource.platform === b.definition.action.resource.platform &&
    a.selection.settings.some((s) =>
      b.selection.settings.some(
        (v) =>
          s.key === v.key ||
          (a.definition.action.resource.platform === 'windows' &&
            (s.key.startsWith(`${v.key}/`) || v.key.startsWith(`${s.key}/`))),
      ),
    )
  function conflicts(c: Claim, all: Claim[]) {
    return all.filter(
      (other) =>
        other.p.id !== c.p.id &&
        overlap(c, other) &&
        c.selection.signature !== other.selection.signature,
    )
  }
  const key = (c: Claim) => JSON.stringify([c.device, c.identity, c.selection.signature])
  function reconcile() {
    const all = claims(),
      desired = new Map<string, Claim[]>()
    for (const c of all) {
      if (conflicts(c, all).length) continue
      const owners = desired.get(key(c)) ?? []
      owners.push(c)
      desired.set(key(c), owners)
    }
    for (const [unit, owners] of desired) {
      const previous = publications.get(unit)
      if (previous?.action === 'remove') continue // An unverified removal never authorizes reapply.
      publications.set(unit, {
        owners,
        operationId: previous?.operationId ?? randomUUID(),
        action: 'apply',
      })
    }
    for (const [unit, previous] of publications) {
      if (desired.has(unit) || previous.action !== 'apply') continue
      if (all.some((c) => previous.owners.some((old) => overlap(c, old)))) continue
      const remove = previous.owners.every(
        (c) => c.definition.action.exit === 'remove' && c.selection.removable,
      )
      previous.action = remove ? 'remove' : 'retain'
      if (remove) previous.operationId = randomUUID()
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    if (scenario === 'denied') return
    if (
      request.path === '/api/v1/policies/previews' &&
      request.method === 'POST' &&
      record(record(request.body)['definition'])['action'] &&
      record(record(record(request.body)['definition'])['action'])['kind'] === 'configuration'
    ) {
      const input = closed(request.body, ['definition'], ['after', 'scopeResult'])
      const d = record(input['definition'])
      // The store's decoder/validator remains the only authoring owner; preview never publishes.
      const definition = configurationDefinition(d)
      if (!selected(definition)) return error('resource_not_found', 404)
      const snapshot = scopes.snapshot(definition.scope)
      if (!snapshot) return error('scope_not_found', 404)
      if ('scopeResult' in input && input['scopeResult'] !== snapshot.result)
        return error('operation_conflict')
      const rows = snapshot.devices.filter(
        (device) => !('after' in input) || device > identifier(input['after']),
      )
      return ok({
        action: definition.action,
        scopeResult: snapshot.result,
        items: rows.slice(0, 64).map((device) => ({
          device,
          eligibility: scopes.resolve(definition.scope)?.members.includes(device)
            ? { state: 'eligible', entry: 1 }
            : { state: 'excluded' },
          taskAdmission: null,
        })),
        nextCursor: rows.length > 64 ? rows[63] : null,
      })
    }
    const match = /^\/api\/v1\/policies\/([^/]+)\/devices$/.exec(request.path),
      p = match && store.get(match[1]!)
    if (!p || p.definition.action.kind !== 'configuration' || request.method !== 'GET') return
    reconcile()
    const all = claims(),
      snapshot = scopes.snapshot(p.definition.scope),
      after = request.query.get('after'),
      rows = [
        ...new Set([
          ...(snapshot?.devices ?? []),
          ...[...publications.values()].flatMap((v) =>
            v.owners.filter((c) => c.p.id === p.id).map((c) => c.device),
          ),
        ]),
      ]
        .filter((d) => after === null || d > after)
        .sort()
    return ok({
      items: rows.slice(0, 64).map((device) => {
        const c = all.find((c) => c.p.id === p.id && c.device === device)
        const diagnoses = c && conflicts(c, all).length ? ['configuration_conflict'] : []
        if (c && publications.get(key(c))?.action === 'remove') diagnoses.push('removing')
        const operationIds = [...publications.values()]
          .filter((v) => v.owners.some((c) => c.p.id === p.id && c.device === device))
          .map((v) => v.operationId)
        return {
          device,
          assignment: c
            ? 'eligible'
            : scopes.resolve(p.definition.scope)?.members.includes(device)
              ? 'pending'
              : 'excluded',
          taskAdmission: null,
          operationIds,
          diagnoses,
        }
      }),
      nextCursor: rows.length > 64 ? rows[63] : null,
    })
  }
  return {
    reconcile,
    handle,
    assigned: (device: string, replacedPolicy?: string): ConfigurationEffects[] =>
      claims(replacedPolicy)
        .filter((c) => c.device === device)
        .map((c) => ({
          id: c.p.id,
          platform: c.definition.action.resource.platform,
          settings: c.selection.settings,
        })),
    plans: () =>
      structuredClone(
        [...publications.values()].map((v) => ({
          policies: v.owners.map((c) => c.p.id),
          device: v.owners[0]!.device,
          action: v.action,
          operationId: v.operationId,
          effect: 'unknown' as const,
        })),
      ),
    reset: () => publications.clear(),
  }
}
import { policyDefinition } from '../../src/features/policies/clients/model'
function configurationDefinition(value: unknown): ConfigurationDefinition {
  const d = policyDefinition(value)
  if (d.action.kind !== 'configuration') throw new Error('Wrong action')
  return { ...d, action: d.action }
}
