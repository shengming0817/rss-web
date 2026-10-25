import { directoryPage } from './directory'
/** Explicit synthetic installer HTTP scenario. It makes no operating-system installation claim. */
import { INSTANCE } from './operations/authorization'
import { createHash, randomUUID } from 'node:crypto'
import { TENANT, type DomainHandler } from './scenario'
import { createReceipts, error, ok } from './http'
import { closed, count, string, uuid } from '../src/services/decode'
import { target } from '../src/features/enrollment/clients/packages'
export function createPackageDemo() {
  const receipts = createReceipts()
  const uploads = new Map<
    string,
    {
      filename: string
      length: number
      sha256: number[]
      bytes: Uint8Array
      complete: boolean
      parsed: boolean
      actor: string
    }
  >()
  const saved = new Map<string, Record<string, unknown>>()
  const published = new Map<string, Record<string, unknown>>()
  const withdrawn = new Set<string>()
  const operations = new Map<string, unknown>()
  const facts = (filename: string) => ({
    format: ({ exe: 'exe', msi: 'msi', msix: 'msix', pkg: 'pkg' } as Record<string, string>)[
      filename.split('.').at(-1)!.toLowerCase()
    ],
    version: null,
    architectures: [],
    bundleId: null,
  })
  const handle: DomainHandler = (r) => {
    const resource = /^\/api\/v1\/resources\/([^/]+)\/uploads\/([^/]+)(\/complete)?$/.exec(r.path)
    if (
      !r.path.startsWith('/api/v1/agent-packages') &&
      !r.path.startsWith('/api/v1/agent/enroll/packages') &&
      (!resource || !uploads.has(resource[2]!))
    )
      return
    const id = r.path.split('/').at(-1)!
    if (r.path === '/api/v1/agent-packages/uploads' && r.method === 'POST') {
      const b = closed(r.body, ['operationId', 'filename', 'length', 'sha256']),
        key = uuid(b['operationId'])
      const filename = string(b['filename']),
        length = count(b['length']),
        sha256 = b['sha256'] as number[]
      if (!facts(filename).format || !length || !Array.isArray(sha256) || sha256.length !== 32)
        return error('malformed_request', 400)
      const old = uploads.get(key)
      if (
        old &&
        (old.filename !== filename ||
          old.length !== length ||
          JSON.stringify(old.sha256) !== JSON.stringify(sha256))
      )
        return error('operation_conflict')
      const value = old ?? {
        filename,
        length,
        sha256,
        bytes: new Uint8Array(),
        complete: false,
        parsed: false,
        actor: `${INSTANCE}:${r.actor.principalId}`,
      }
      uploads.set(key, value)
      return ok({
        packageId: key,
        resource: key,
        upload: key,
        offset: value.bytes.length,
        length,
        complete: value.complete,
        href: `/api/v1/resources/${key}/uploads/${key}`,
      })
    }
    if (resource) {
      const key = resource[2]!,
        value = uploads.get(key)!
      if (resource[1] !== key || value.actor !== `${INSTANCE}:${r.actor.principalId}`)
        return error('permission_denied', 403)
      const status = () => ({
        id: key,
        binding: {
          purpose: { kind: 'software', binding: { resource: key, filename: value.filename } },
          reference: 'installer',
          length: value.length,
          sha256: value.sha256,
          actor: value.actor,
        },
        offset: value.bytes.length,
        expires: 4102444800,
        complete: value.complete,
      })
      if (r.method === 'GET') return ok(status())
      if (r.method === 'PATCH') {
        if (Number(r.query.get('offset')) !== value.bytes.length)
          return {
            status: 409,
            body: { code: 'upload_offset_conflict', offset: value.bytes.length },
          }
        if (
          !(r.body instanceof ArrayBuffer) ||
          value.complete ||
          value.bytes.length + r.body.byteLength > value.length
        )
          return error('malformed_request', 400)
        const next = new Uint8Array(value.bytes.length + r.body.byteLength)
        next.set(value.bytes)
        next.set(new Uint8Array(r.body), value.bytes.length)
        value.bytes = next
        return ok(status())
      }
      if (r.method === 'POST' && resource[3]) {
        if (
          value.bytes.length !== value.length ||
          !createHash('sha256')
            .update(value.bytes)
            .digest()
            .every((x, i) => x === value.sha256[i])
        )
          return error('malformed_request', 400)
        value.complete = true
        value.parsed = value.length <= 1_073_741_824
        return ok(undefined, 201)
      }
    }
    if (
      r.path.startsWith('/api/v1/agent-packages/uploads/') &&
      (r.method === 'GET' || r.method === 'POST')
    ) {
      const value = uploads.get(id)
      if (!value?.complete) return error('operation_conflict')
      if (value.actor !== `${INSTANCE}:${r.actor.principalId}`)
        return error('permission_denied', 403)
      if (r.method === 'POST') value.parsed = true
      return ok({
        packageId: id,
        filename: value.filename,
        length: value.length,
        sha256: value.sha256,
        format: facts(value.filename).format,
        inspection: value.parsed
          ? { status: 'parsed', facts: facts(value.filename) }
          : { status: 'skipped_size_limit' },
      })
    }
    if (r.path.startsWith('/api/v1/agent-packages/operations/') && r.method === 'GET')
      return ok(operations.get(id) ?? null)
    if (r.method === 'POST') {
      const b = r.body as Record<string, unknown>,
        op = uuid(b['operationId'])
      return receipts.write(r, op, () => {
        if (r.path === '/api/v1/agent-packages/save') {
          const key = uuid(b['packageId']),
            value = uploads.get(key),
            selected = target(b['target'])
          if (
            !value?.complete ||
            !string(b['version']).trim() ||
            (selected.platform === 'macos') !== (facts(value.filename).format === 'pkg')
          )
            return error('malformed_request', 400)
          const result = {
            packageId: key,
            resource: key,
            version: 'v1',
            variant: 'default',
            productVersion: b['version'],
            material: {
              ...facts(value.filename),
              version: b['version'],
              architectures: [selected.architecture],
            },
            sha256: value.sha256,
            length: value.length,
            filename: value.filename,
            href: `/api/v1/software/resources/${key}/versions/v1`,
            storageRevision: 4,
          }
          saved.set(key, { ...result, target: selected })
          operations.set(op, result)
          return ok(result)
        }
        if (r.path === '/api/v1/agent-packages') {
          const value = saved.get(uuid(b['packageId']))
          if (!value) return error('resource_not_found', 404)
          const format = (
            {
              exe: 'windows_exe',
              msi: 'windows_msi',
              msix: 'windows_msix',
              pkg: 'macos_pkg',
            } as Record<string, string>
          )[(value['material'] as { format: string }).format]
          const result = {
            releaseId: randomUUID(),
            tenantId: TENANT,
            target: value['target'],
            version: value['productVersion'],
            format,
            filename: value['filename'],
            length: value['length'],
            installerSha256: value['sha256'],
          }
          published.set(result.releaseId, result)
          operations.set(op, result)
          return ok(result)
        }
        if (r.path.endsWith('/withdraw')) {
          const release = r.path.split('/').at(-2)!
          withdrawn.add(release)
          operations.set(op, { withdrawn: release })
          return ok(undefined, 204)
        }
        return error('action_not_supported', 501)
      })
    }
    if (r.method === 'GET') {
      if (r.path === '/api/v1/agent-packages')
        return ok(
          directoryPage(
            [...published.values()].map((p) => ({
              ...p,
              state: withdrawn.has(String(p['releaseId'])) ? 'withdrawn' : 'published',
              ...target(p['target']),
            })),
            r,
            ['releaseId'],
            { defaultLimit: 64 },
          ),
        )
      if (r.path === '/api/v1/agent/enroll/packages')
        return ok([...published.values()].filter((p) => !withdrawn.has(String(p['releaseId']))))
      if (r.path.endsWith('/content')) {
        const key = r.path.split('/').at(-2)!,
          release = published.get(key)
        if (release && !withdrawn.has(key)) {
          const value = [...uploads.values()].find(
            (x) => JSON.stringify(x.sha256) === JSON.stringify(release['installerSha256']),
          )
          if (value) return ok(value.bytes.buffer)
        }
      }
      return published.has(id) ? ok(published.get(id)) : error('resource_not_found', 404)
    }
  }
  return {
    handle,
    reset() {
      receipts.reset()
      uploads.clear()
      saved.clear()
      published.clear()
      withdrawn.clear()
      operations.clear()
    },
  }
}
