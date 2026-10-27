/** MOCK_SOURCE: in-memory archive fixture. No encryption, CA, real keys or uploaded secrets. */
import { createHash } from 'node:crypto'
import { INSTANCE } from '../operations/authorization'
import { TENANT, type DemoRequest, type DomainHandler, type Reply } from '../scenario'
import { directoryPage, windowPage } from '../directory'
import { error, ok } from '../http'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  nullable,
  string,
  uuid,
} from '../../src/services/decode'
import { grant, type Permission } from '../../src/features/operations/clients/authorization'
import {
  metadata,
  profiles,
  receipt,
  settings,
  version,
  type Entry,
  type Reference,
  type Vault,
  type Version,
} from '../../src/features/security/certificate-archive/model'

export const SYNTHETIC_ARCHIVE_MARKER =
  'RSS MDM SYNTHETIC ARCHIVE — NOT A CERTIFICATE OR PRIVATE KEY'
const base = '/api/v1/certificate-archive'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
class ArchiveFault extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code)
  }
}
const fail = (code: string, status: number): never => {
  throw new ArchiveFault(code, status)
}
const positive = (value: unknown) => {
  const result = count(value)
  if (!result) throw new Error('revision')
  return result
}
const reference = (value: unknown): Reference => {
  const input = closed(value, ['entryId', 'version'])
  return { entryId: uuid(input['entryId']), version: positive(input['version']) }
}
function allows(request: DemoRequest, permission: Permission) {
  return (
    Array.isArray(request.authorization) &&
    request.authorization.some((value) => {
      if (!value || typeof value !== 'object') return false
      const decoded = grant({
        operation: Reflect.get(value, 'operation'),
        scope: Reflect.get(value, 'scope'),
      })
      return decoded.operation === permission && decoded.scope.kind === 'tenant'
    })
  )
}

/** Uses the existing scenario's authorization projection, tenant and session. Never grants demo authority. */
export function createCertificateArchiveDemo(now: () => number) {
  let generation = 0,
    passwordDigest = '',
    configuration = settings({
      revision: 0,
      value: {
        reminderDays: 30,
        categories: [
          'https',
          'mdm-ca',
          'agent-ca',
          'apns',
          'profile-signing',
          'code-signing',
          'trust',
          'custom',
        ],
      },
    })
  const entries = new Map<string, Entry>(),
    versions = new Map<string, Version[]>(),
    unlocks = new Map<string, { generation: number; until: number }>(),
    operations = new Map<
      string,
      { digest: string; receipt: ReturnType<typeof receipt>; result: unknown }
    >()
  const actorKey = (request: DemoRequest) =>
    JSON.stringify([request.actor.tenantId, INSTANCE, request.actor.principalId])
  const sessionKey = (request: DemoRequest) =>
    JSON.stringify([actorKey(request), request.actor.sessionId])
  const operationKey = (request: DemoRequest, operation: string) =>
    JSON.stringify([actorKey(request), operation])
  function requirePermission(request: DemoRequest, permission: Permission) {
    if (!allows(request, permission)) fail('permission_denied', 403)
  }
  function state(request: DemoRequest): Vault {
    const key = sessionKey(request),
      unlocked = unlocks.get(key)
    if (unlocked && (unlocked.generation !== generation || unlocked.until <= now()))
      unlocks.delete(key)
    return {
      initialized: generation > 0,
      generation,
      unlockedUntil: allows(request, 'certificate_archive_unlock')
        ? (unlocks.get(key)?.until ?? null)
        : null,
    }
  }
  function requireUnlock(request: DemoRequest) {
    requirePermission(request, 'certificate_archive_unlock')
    if (state(request).unlockedUntil === null) fail('archive_locked', 423)
  }
  function password(value: unknown) {
    const secret = string(value)
    if (Buffer.byteLength(secret) < 12 || Buffer.byteLength(secret) > 1024 || secret.includes('\0'))
      throw new Error('password')
    return hash('synthetic-demo-verifier:' + secret)
  }
  function readVersion(id: Reference): Version {
    return (
      versions.get(id.entryId)?.find((value) => value.version === id.version) ??
      fail('archive_not_found', 404)
    )
  }
  function checkRevision(id: string, expected: number) {
    if ((entries.get(id)?.revision ?? 0) !== expected) fail('operation_conflict', 409)
  }
  function save(
    request: DemoRequest,
    operation: string,
    action: 'import' | 'generate' | 'metadata',
    input: Record<string, unknown>,
    facts: Version['facts'],
  ) {
    const id = uuid(input['entryId']),
      expected = count(input['expectedRevision'])
    checkRevision(id, expected)
    const details = metadata(input['metadata']),
      previous = entries.get(id),
      next = expected + 1
    const item = version({
      entryId: id,
      version: next,
      actor: request.actor.principalId,
      instance: INSTANCE,
      operationId: operation,
      createdAt: now(),
      metadata: details,
      facts,
      requestVersion: null,
      source: action,
    })
    versions.set(id, [...(versions.get(id) ?? []), item])
    entries.set(id, {
      id,
      revision: next,
      retired: previous?.retired ?? false,
      recommendedVersion: previous ? previous.recommendedVersion : next,
      latest: item,
    })
    return receipt(
      {
        operationId: operation,
        action: 'certificate_archive_' + action,
        entryId: id,
        version: next,
        revision: next,
      },
      operation,
    )
  }
  function write(
    request: DemoRequest,
    apply: (operation: string) => { receipt: ReturnType<typeof receipt>; result?: unknown },
  ): Reply {
    const operation = uuid(request.headers['idempotency-key']),
      key = operationKey(request, operation),
      digest = hash(JSON.stringify([request.method, request.path, request.body])),
      previous = operations.get(key)
    if (previous)
      return previous.digest === digest
        ? ok(structuredClone(previous.result))
        : error('operation_conflict')
    const result = apply(operation)
    operations.set(key, {
      digest,
      receipt: result.receipt,
      result: structuredClone(result.result ?? result.receipt),
    })
    return ok(structuredClone(result.result ?? result.receipt))
  }
  const syntheticFacts = (name: string): Version['facts'] => [
    { name, format: 'opaque', certificates: [], publicKeys: [], containsPrivateKey: false },
  ]
  const handle: DomainHandler = (request, scenario) => {
    if (request.path !== base && !request.path.startsWith(base + '/')) return
    if (request.actor.tenantId !== TENANT || scenario === 'denied' || scenario === 'forbidden')
      return error('permission_denied', 403)
    if (scenario === 'conflict' && request.method !== 'GET') return error('operation_conflict')
    try {
      const path = request.path.slice(base.length),
        entry = /^\/entries\/([^/]+)(?:\/(versions|metadata))?$/.exec(path)
      if (request.method === 'GET') {
        requirePermission(request, 'certificate_archive_read')
        if (path === '/vault') return ok(state(request))
        if (path === '/settings') return ok(structuredClone(configuration))
        if (path === '/entries')
          return ok({
            tenantId: TENANT,
            ...directoryPage(scenario === 'empty' ? [] : [...entries.values()], request, ['id'], {
              maxLimit: 200,
              defaultLimit: 50,
            }),
            asOf: now(),
            reminderDays: configuration.value.reminderDays,
            alerts: { expired: 0, expiring: 0, notYetValid: 0 },
          })
        if (entry) {
          const id = uuid(entry[1]),
            item = entries.get(id)
          if (!item) return error('archive_not_found', 404)
          if (entry[2] === 'versions')
            return ok(
              windowPage(
                versions.get(id) ?? [],
                request,
                (item) => [item.version],
                item.revision,
                true,
              ),
            )
          if (!entry[2]) return ok(structuredClone(item))
        }
        const original = /^\/operations\/([^/]+)$/.exec(path)
        if (original) {
          const result = operations.get(operationKey(request, uuid(original[1])))
          return result ? ok(structuredClone(result.receipt)) : error('archive_not_found', 404)
        }
        return error('archive_not_found', 404)
      }
      if (request.method === 'POST' && path === '/vault/lock') {
        unlocks.delete(sessionKey(request))
        return ok({ locked: true })
      }
      if (request.method === 'POST' && path === '/vault/unlock') {
        requirePermission(request, 'certificate_archive_unlock')
        const input = closed(request.body, ['password'])
        if (!generation) fail('archive_locked', 423)
        if (password(input['password']) !== passwordDigest) fail('archive_password_rejected', 403)
        unlocks.set(sessionKey(request), { generation, until: now() + 900 })
        return ok(state(request))
      }
      if (request.method === 'POST' && path === '/export') {
        requirePermission(request, 'certificate_archive_export')
        requireUnlock(request)
        return write(request, (operation) => {
          const id = reference(request.body),
            item = readVersion(id)
          const result = {
            ...id,
            files: [
              {
                name: 'MOCK-NOT-A-CERTIFICATE.txt',
                data: Buffer.from(
                  SYNTHETIC_ARCHIVE_MARKER +
                    '\nSynthetic archive export. No imported bytes, certificate, private key or encryption proof.\n',
                ).toString('base64'),
              },
            ],
          }
          return {
            receipt: receipt(
              {
                operationId: operation,
                action: 'certificate_archive_export',
                entryId: id.entryId,
                version: id.version,
                revision: item.version,
              },
              operation,
            ),
            result,
          }
        })
      }
      requirePermission(request, 'certificate_archive_write')
      if (request.method === 'POST' && path === '/vault/initialize') {
        requirePermission(request, 'certificate_archive_unlock')
        return write(request, (operation) => {
          const input = closed(request.body, ['password']),
            digest = password(input['password'])
          if (generation) fail('operation_conflict', 409)
          generation = 1
          passwordDigest = digest
          return {
            receipt: receipt(
              {
                operationId: operation,
                action: 'certificate_archive_initialize',
                entryId: null,
                version: null,
                revision: generation,
              },
              operation,
            ),
          }
        })
      }
      if (request.method === 'POST' && path === '/vault/password') {
        requirePermission(request, 'certificate_archive_unlock')
        return write(request, (operation) => {
          const input = closed(request.body, ['oldPassword', 'newPassword'])
          if (!generation) fail('archive_locked', 423)
          if (password(input['oldPassword']) !== passwordDigest)
            fail('archive_password_rejected', 403)
          passwordDigest = password(input['newPassword'])
          generation++
          unlocks.clear()
          return {
            receipt: receipt(
              {
                operationId: operation,
                action: 'certificate_archive_password_change',
                entryId: null,
                version: null,
                revision: generation,
              },
              operation,
            ),
          }
        })
      }
      if (request.method === 'PUT' && path === '/settings')
        return write(request, (operation) => {
          const input = closed(request.body, ['expectedRevision', 'value']),
            expected = count(input['expectedRevision'])
          if (expected !== configuration.revision) fail('operation_conflict', 409)
          const next = settings({ revision: expected + 1, value: input['value'] })
          if (
            next.value.categories.length > 128 ||
            next.value.categories.some((value) => !value || Buffer.byteLength(value) > 128)
          )
            throw new Error('categories')
          configuration = next
          return {
            receipt: receipt(
              {
                operationId: operation,
                action: 'certificate_archive_settings',
                entryId: null,
                version: null,
                revision: next.revision,
              },
              operation,
            ),
          }
        })
      if (request.method === 'PUT' && entry && !entry[2])
        return write(request, (operation) => {
          const id = uuid(entry[1]),
            input = closed(request.body, ['expectedRevision', 'retired', 'recommendedVersion']),
            expected = positive(input['expectedRevision'])
          checkRevision(id, expected)
          const old = entries.get(id)!,
            recommended = nullable(input['recommendedVersion'], positive)
          if (recommended !== null) readVersion({ entryId: id, version: recommended })
          entries.set(id, {
            ...old,
            revision: expected + 1,
            retired: boolean(input['retired']),
            recommendedVersion: recommended,
          })
          return {
            receipt: receipt(
              {
                operationId: operation,
                action: 'certificate_archive_manage',
                entryId: id,
                version: null,
                revision: expected + 1,
              },
              operation,
            ),
          }
        })
      if (request.method === 'PUT' && entry?.[2] === 'metadata') {
        requireUnlock(request)
        return write(request, (operation) => {
          const id = uuid(entry[1]),
            input = closed(request.body, ['expectedRevision', 'metadata']),
            old = entries.get(id) ?? fail('archive_not_found', 404)
          return {
            receipt: save(
              request,
              operation,
              'metadata',
              { ...input, entryId: id },
              old.latest.facts,
            ),
          }
        })
      }
      if (request.method === 'POST' && path === '/import') {
        requireUnlock(request)
        return write(request, (operation) => {
          const input = closed(request.body, [
            'entryId',
            'expectedRevision',
            'metadata',
            'files',
            'requestVersion',
          ])
          // The demo never parses, accepts or retains real certificate/key material or passwords.
          if (input['requestVersion'] !== null) fail('archive_material_invalid', 400)
          const files = array(input['files'], (value) => {
            const file = closed(value, ['name', 'format', 'data', 'password']),
              name = string(file['name'])
            if (
              !name ||
              name.includes('/') ||
              name.includes('\\') ||
              file['format'] !== 'opaque' ||
              file['password'] !== null
            )
              fail('archive_material_invalid', 400)
            const data = string(file['data'])
            if (
              data.length > 4 * 1024 * 1024 ||
              !/^[A-Za-z0-9+/]*={0,2}$/.test(data) ||
              data.length % 4
            )
              fail('archive_material_invalid', 400)
            const text = Buffer.from(data, 'base64').toString('utf8')
            if (!text.startsWith(SYNTHETIC_ARCHIVE_MARKER)) fail('archive_material_invalid', 400)
            return { name: 'MOCK-' + name, bytes: Buffer.byteLength(text) }
          })
          if (
            !files.length ||
            files.length > 16 ||
            files.reduce((n, f) => n + f.bytes, 0) > 1024 * 1024
          )
            fail('archive_material_invalid', 400)
          return {
            receipt: save(
              request,
              operation,
              'import',
              input,
              files.flatMap((file) => syntheticFacts(file.name)),
            ),
          }
        })
      }
      if (request.method === 'POST' && path === '/generate') {
        requireUnlock(request)
        return write(request, (operation) => {
          const input = closed(request.body, [
            'entryId',
            'expectedRevision',
            'metadata',
            'profile',
            'algorithm',
            'commonName',
            'organization',
            'sans',
            'days',
            'issuer',
            'scepUrl',
          ])
          const profile = enumeration(input['profile'], profiles),
            algorithm = enumeration(input['algorithm'], ['rsa2048', 'rsa3072', 'p256'] as const),
            sans = array(input['sans'], string)
          if (profile === 'apns_csr' && (algorithm !== 'rsa2048' || sans.length))
            throw new Error('apns')
          if (profile !== 'https' && input['issuer'] !== null) throw new Error('issuer')
          if (profile === 'https') fail('archive_key_mismatch', 400)
          if (
            !string(input['commonName']).trim() ||
            Buffer.byteLength(string(input['commonName'])) > 256 ||
            Buffer.byteLength(string(input['organization'])) > 256 ||
            sans.length > 32 ||
            count(input['days']) > 36500
          )
            throw new Error('generation')
          if (profile === 'scep_template' && input['scepUrl'] === null) throw new Error('scep')
          if (input['scepUrl'] !== null) {
            const url = new URL(string(input['scepUrl']))
            if (url.protocol !== 'https:' || url.username || url.password || url.hash)
              throw new Error('scep')
          }
          // A successful fixture version contains an opaque MOCK text marker, never a fabricated X.509 fact or key.
          return {
            receipt: save(
              request,
              operation,
              'generate',
              input,
              syntheticFacts('MOCK-' + profile + '-NOT-A-CERTIFICATE.txt'),
            ),
          }
        })
      }
      return error('archive_not_found', 404)
    } catch (failure) {
      return failure instanceof ArchiveFault
        ? error(failure.code, failure.status)
        : error('malformed_request', 400)
    }
  }
  return {
    handle,
    reset() {
      generation = 0
      passwordDigest = ''
      entries.clear()
      versions.clear()
      unlocks.clear()
      operations.clear()
      configuration = settings({
        revision: 0,
        value: {
          reminderDays: 30,
          categories: [
            'https',
            'mdm-ca',
            'agent-ca',
            'apns',
            'profile-signing',
            'code-signing',
            'trust',
            'custom',
          ],
        },
      })
    },
  }
}
