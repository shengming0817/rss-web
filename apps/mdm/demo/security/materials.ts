import { randomUUID } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import type { createSecurityRequests } from './requests'
import { closed, count, enumeration, identifier, uuid } from '../../src/services/decode'
import {
  material,
  materialKinds,
  hasEscrow,
  type Material,
  type MaterialKind,
} from '../../src/features/security/clients/materials-model'
import type { SecurityRequestTarget } from '../../src/features/security/clients/requests-model'
import type { SecuritySource } from '../../src/features/security/clients/source'
import { error } from '../http'
import { candidate, createSecurityPages, queryKeys } from './http'
import { hasSecuritySource } from './source'
export function createMaterialsDemo(
  now: () => number,
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  requests: Pick<ReturnType<typeof createSecurityRequests>, 'rows' | 'consume'>,
  blocked: (device: string, kind: MaterialKind) => boolean,
) {
  const records = new Map<string, Material>(),
    disclosures = new Set<string>(),
    pages = createSecurityPages(now)
  function source(device: string, kind: MaterialKind): SecuritySource | null {
    const d = devices.facts().find((d) => d.summary.id === device),
      expected =
        kind === 'laps' ? 'agent.builtin' : kind === 'bitlocker' ? 'mdm.windows' : 'mdm.apple',
      active = d?.registrations.filter((r) => r.status === 'active' && r.source === expected) ?? []
    if (active.length !== 1) return null
    return {
      registrationId: active[0]!.registrationId,
      generation: active[0]!.generation,
      source: expected,
    }
  }
  function executable(device: string, kind: MaterialKind) {
    const s = source(device, kind),
      d = devices.facts().find((d) => d.summary.id === device),
      capability = `material.${kind}.${kind === 'bootstrap_token' ? 'reescrow' : 'rotate'}.v1`
    return s &&
      d?.securityBindings?.some(
        (b) =>
          b.registration === s.registrationId &&
          b.generation === s.generation &&
          b.capabilities.includes(capability),
      )
      ? s
      : null
  }
  function initial(device: string, kind: MaterialKind) {
    const d = devices.facts().find((d) => d.summary.id === device)
    if (!d) return undefined
    const platform = d.summary.platform,
      expected = ['bitlocker', 'laps'].includes(kind) ? 'windows' : 'macos',
      s = source(device, kind),
      applicable = platform === expected,
      ready = applicable && !!s,
      appleSilicon = d.architecture === 'aarch64',
      at = now()
    const details = !ready
      ? null
      : kind === 'bitlocker'
        ? {
            volumes: [
              { id: 'os', role: 'os', encryption: 'on', escrow: 'available', keyId: randomUUID() },
            ],
            tpm: 'ready',
          }
        : kind === 'filevault'
          ? {
              encryption: 'on',
              keyType: 'personal',
              escrow: 'available',
              keyId: randomUUID(),
              profile: 'applied',
            }
          : kind === 'laps'
            ? {
                account: 'rss-demo-admin',
                backup: 'cloud',
                policy: 'applied',
                escrow: 'available',
                lastRotatedAt: at - 60,
                nextRotationAt: at + 86400,
              }
            : kind === 'bootstrap_token'
              ? {
                  supported: true,
                  supervised: true,
                  ade: true,
                  deviceChannel: true,
                  awaitingConfiguration: false,
                  escrow: 'absent',
                }
              : {
                  appleSilicon,
                  supervised: true,
                  deviceChannel: true,
                  accessRight: true,
                  configured: 'yes',
                  escrow: 'available',
                  verification: 'verified',
                }
    const eligible = ready && (kind !== 'recovery_lock' || appleSilicon),
      operation = kind === 'bootstrap_token' ? 'reescrow' : 'rotate'
    return material({
      device,
      kind,
      revision: 1,
      platform,
      state:
        !applicable && platform !== 'unknown' ? 'not_applicable' : ready ? 'observed' : 'unknown',
      evaluatedAt: at,
      source: ready ? s : null,
      prerequisites: {
        status:
          !applicable && platform !== 'unknown'
            ? 'ineligible'
            : !ready
              ? 'unknown'
              : eligible
                ? 'eligible'
                : 'ineligible',
        reasons:
          !applicable && platform !== 'unknown'
            ? ['platform_unsupported']
            : !ready
              ? ['missing_registration']
              : eligible
                ? []
                : ['requires_apple_silicon'],
      },
      actions: eligible
        ? [
            ...(kind === 'bootstrap_token' ? [] : ['reveal']),
            ...(executable(device, kind) ? [operation] : []),
          ]
        : [],
      details,
    })
  }
  function read(device: string, kind: MaterialKind) {
    const key = `${device}:${kind}`
    let value = records.get(key)
    if (!value) {
      value = initial(device, kind)
      if (!value) return undefined
      records.set(key, value)
    }
    if (
      value.source &&
      !hasSecuritySource(
        devices.facts().find((d) => d.summary.id === device),
        value.source,
      )
    ) {
      value = material({
        ...value,
        revision: value.revision + 1,
        state: 'unknown',
        evaluatedAt: now(),
        source: null,
        details: null,
        prerequisites: { status: 'unknown', reasons: ['source_changed'] },
        actions: [],
      })
      records.set(key, value)
    }
    const result = structuredClone(value)
    if (blocked(device, kind)) result.actions = result.actions.filter((a) => a !== 'reveal')
    return result
  }
  function valid(target: SecurityRequestTarget) {
    if (target.kind !== 'material_access' && target.kind !== 'material_operation') return false
    const value = read(target.device, target.material)
    if (
      !value ||
      value.revision !== target.materialRevision ||
      value.state !== 'observed' ||
      !value.actions.includes(target.action)
    )
      return false
    if (value.kind === 'bitlocker' && !value.details?.volumes.some((v) => v.id === target.volume))
      return false
    return target.kind === 'material_access'
      ? hasEscrow(value, target.volume)
      : executable(target.device, target.material) !== null
  }
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/v1\/mdm-candidate\/security\/materials\/([^/]+)(?:\/([^/]+)(\/reveal)?)?$/.exec(
        request.path,
      )
    if (!match) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      const device = identifier(match[1]),
        kind = match[2] ? enumeration(match[2], materialKinds) : null
      if (request.method === 'GET' && !match[3]) {
        if (kind) {
          queryKeys(request.query, [])
          const value = read(device, kind)
          return value
            ? candidate({ material: value, asOf: now() })
            : error('inventory_not_found', 404)
        }
        queryKeys(request.query, ['limit', 'cursor'])
        if (!devices.facts().some((d) => d.summary.id === device))
          return error('inventory_not_found', 404)
        return candidate(
          pages.page(
            `${request.actor.principalId}:${device}:materials`,
            scenario === 'empty' ? [] : materialKinds.map((k) => read(device, k)!),
            request.query,
          ),
        )
      }
      if (request.method !== 'POST' || !match[3] || !kind || kind === 'bootstrap_token')
        return error('malformed_request', 400)
      queryKeys(request.query, [])
      const body = closed(request.body, ['disclosureId', 'request', 'expectedRevision']),
        disclosureId = uuid(body['disclosureId']),
        id = uuid(body['request']),
        revision = count(body['expectedRevision']),
        authorized = requests.rows().find((r) => r.id === id)
      if (!authorized) return error('operation_not_found', 404)
      if (authorized.requester !== request.actor.principalId) return error('permission_denied', 403)
      const target = authorized.target
      if (
        disclosures.has(disclosureId) ||
        target.kind !== 'material_access' ||
        target.material !== kind ||
        target.device !== device
      )
        return error('operation_conflict')
      const consumed = requests.consume(id, revision, request.actor.principalId, disclosureId)
      if (!consumed) return error('operation_conflict')
      disclosures.add(disclosureId)
      // One response only. No secret storage, generic operation receipt, cache or audit payload.
      return candidate({
        disclosureId,
        request: id,
        device,
        material: kind,
        materialRevision: target.materialRevision,
        volume: target.volume,
        principal: request.actor.principalId,
        sessionId: request.actor.sessionId,
        issuedAt: now(),
        expiresAt: Math.min(now() + 30, authorized.validUntil),
        secret: `SYNTHETIC-${kind}-${randomUUID()}`,
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    read,
    valid,
    source: executable,
    observe(
      target: Extract<SecurityRequestTarget, { kind: 'material_operation' }>,
      identity: SecuritySource,
      at: number,
    ) {
      const value = read(target.device, target.material)
      if (
        !value ||
        value.revision !== target.materialRevision ||
        !value.details ||
        at <= value.evaluatedAt ||
        JSON.stringify(executable(target.device, target.material)) !== JSON.stringify(identity)
      )
        return false
      const stored = structuredClone(records.get(`${target.device}:${target.material}`)!)
      if (stored.kind === 'bitlocker' && stored.details) {
        const volume = stored.details.volumes.find((v) => v.id === target.volume)
        if (!volume) return false
        volume.escrow = 'available'
        volume.keyId = randomUUID()
      } else if (stored.kind === 'filevault' && stored.details) {
        stored.details.escrow = 'available'
        stored.details.keyId = randomUUID()
      } else if (stored.kind === 'laps' && stored.details) {
        stored.details.escrow = 'available'
        stored.details.lastRotatedAt = at
        stored.details.nextRotationAt = at + 86400
      } else if (stored.kind === 'bootstrap_token' && stored.details)
        stored.details.escrow = 'present'
      else if (stored.kind === 'recovery_lock' && stored.details) {
        stored.details.escrow = 'available'
        stored.details.configured = 'yes'
        stored.details.verification = 'verified'
      }
      stored.revision++
      stored.evaluatedAt = at
      records.set(`${target.device}:${target.material}`, material(stored))
      return true
    },
    reset() {
      records.clear()
      disclosures.clear()
      pages.reset()
    },
  }
}
