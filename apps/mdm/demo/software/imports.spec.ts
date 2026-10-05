import { expect, it } from 'vitest'
import { decodeMdmError } from '@rss/api/mdm'
import { createResourceDemo } from '../policies/resources'
import { createAdmissionDemo } from './admission'
import { createImportsDemo } from './imports'
import { operation, request, softwareResource } from './fixtures'
function setup() {
  const resources = createResourceDemo(() => false),
    admission = createAdmissionDemo(resources)
  const imports = createImportsDemo(resources, admission)
  const path = '/api/v1/software/sources/winget/revisions/1'
  admission.handle(
    request(
      path,
      operation(
        {
          action: 'register',
          definition: {
            id: 'winget',
            revision: '1',
            kind: 'winget',
            location: 'https://source.example.test',
            publishers: [],
          },
        },
        0,
      ),
    ),
    'normal',
  )
  admission.handle(
    request(path, operation({ action: 'approve', evidence: ['reviewed'] }, 1)),
    'normal',
  )
  const query = new URLSearchParams({
    source: 'winget',
    revision: '1',
    package: 'Example.Browser',
    version: '128.0',
    platform: 'windows',
    architecture: 'x86_64',
  })
  const resolution = imports.handle(
    request('/api/v1/mdm-candidate/software/import-resolutions', undefined, undefined, query),
    'normal',
  )!
  return {
    resources,
    admission,
    imports,
    query,
    resolution: (resolution.body as { resolution: { id: string } }).resolution,
  }
}
it('pins exact source and package coordinates, atomically imports all files, and does not grant version admission', () => {
  const { imports, resources, admission, resolution, query } = setup()
  query.set('version', 'latest')
  expect(
    imports.handle(
      request('/api/v1/mdm-candidate/software/import-resolutions', undefined, undefined, query),
      'normal',
    )?.status,
  ).toBe(404)
  const id = crypto.randomUUID(),
    path = `/api/v1/mdm-candidate/software/imports/${id}`
  const start = operation(
    {
      action: 'start',
      resolution: resolution.id,
      resource: 'browser',
      version: '1',
      expectedResourceRevision: 0,
    },
    0,
  )
  expect(imports.handle(request(path, start), 'normal')?.status).toBe(202)
  expect(imports.handle(request(path, start), 'normal')?.status).toBe(202)
  expect(resources.read('browser')).toBeNull()
  imports.advance('normal')
  expect(imports.handle(request(path), 'normal')?.body).toMatchObject({
    job: { status: 'completed', resource: 'browser', version: '1', revision: 2 },
  })
  expect(resources.read('browser')?.versions[0]?.variants[0]?.declaration).toMatchObject({
    kind: 'software',
    definition: {
      package: 'Example.Browser',
      version: '128.0',
      source: { id: 'winget', revision: '1' },
    },
  })
  expect(resources.contentReady('browser', '1')).toBe(true)
  expect(admission.isAdmitted('browser', '1')).toBe(false)
})
it('cancels queued jobs and reconciles committed unknown imports through the same Resource operation', () => {
  const { imports, resources, resolution } = setup()
  const path = `/api/v1/mdm-candidate/software/imports/${crypto.randomUUID()}`
  imports.handle(
    request(
      path,
      operation(
        {
          action: 'start',
          resolution: resolution.id,
          resource: 'browser',
          version: '1',
          expectedResourceRevision: 0,
        },
        0,
      ),
    ),
    'normal',
  )
  const cancel = operation({ action: 'cancel' }, 1)
  expect(imports.handle(request(path, cancel), 'normal')?.status).toBe(200)
  imports.advance('normal')
  expect(resources.read('browser')).toBeNull()
  const second = `/api/v1/mdm-candidate/software/imports/${crypto.randomUUID()}`
  imports.handle(
    request(
      second,
      operation(
        {
          action: 'start',
          resolution: resolution.id,
          resource: 'browser',
          version: '1',
          expectedResourceRevision: 0,
        },
        0,
      ),
    ),
    'normal',
  )
  imports.advance('unknown')
  expect(resources.read('browser')?.revision).toBe(1)
  expect(imports.handle(request(second), 'normal')?.body).toMatchObject({
    job: { status: 'unknown', revision: 2 },
  })
  expect(
    imports.handle(request(second, operation({ action: 'cancel' }, 2)), 'normal')?.status,
  ).toBe(409)
  expect(
    imports.handle(request(second, operation({ action: 'reconcile' }, 2)), 'normal')?.body,
  ).toMatchObject({ job: { status: 'completed', revision: 3 } })
  expect(resources.read('browser')?.revision).toBe(1)
  expect(resources.read('browser')?.versions).toHaveLength(1)
})
it('refuses work after source withdrawal', () => {
  const { imports, resources, resolution, admission } = setup()
  const path = `/api/v1/mdm-candidate/software/imports/${crypto.randomUUID()}`
  imports.handle(
    request(
      path,
      operation(
        {
          action: 'start',
          resolution: resolution.id,
          resource: 'browser',
          version: '1',
          expectedResourceRevision: 0,
        },
        0,
      ),
    ),
    'normal',
  )
  admission.handle(
    request(
      '/api/v1/software/sources/winget/revisions/1',
      operation({ action: 'withdraw', evidence: ['revoked'] }, 2),
    ),
    'normal',
  )
  imports.advance('normal')
  expect(imports.handle(request(path), 'normal')?.body).toMatchObject({
    job: { status: 'failed', failure: 'source_withdrawn' },
  })
  expect(resources.read('browser')).toBeNull()
})
it('rejects a concurrent Resource change and atomically rejects a corrupt imported file set', () => {
  const { imports, resources, resolution } = setup()
  const path = `/api/v1/mdm-candidate/software/imports/${crypto.randomUUID()}`
  imports.handle(
    request(
      path,
      operation(
        {
          action: 'start',
          resolution: resolution.id,
          resource: 'browser',
          version: '1',
          expectedResourceRevision: 0,
        },
        0,
      ),
    ),
    'normal',
  )
  resources.handle(
    request('/api/v1/resources/browser', operation({ action: 'create', kind: 'software' }, 0)),
    'normal',
  )
  imports.advance('normal')
  expect(imports.handle(request(path), 'normal')?.body).toMatchObject({
    job: { status: 'failed', failure: 'resource_conflict' },
  })
  expect(resources.read('browser')?.versions).toHaveLength(0)
  const material = softwareResource()
  const version = material.resources.read('app')!.versions[0]!
  const result = resources.importVersion({
    operation: crypto.randomUUID(),
    actor: 'test',
    resource: 'corrupt',
    version: '1',
    expectedRevision: 0,
    variants: version.variants,
    files: [
      {
        platform: 'windows',
        architecture: 'x86_64',
        variant: 'main',
        reference: 'installer',
        bytes: new Uint8Array([9, 9, 9]),
      },
    ],
  })
  expect(result).toEqual({ failure: 'content_invalid' })
  expect(resources.read('corrupt')).toBeNull()
  expect(resources.contentReady('corrupt', '1')).toBe(false)
})
it('resolves Brew as a pinned macOS user package and rejects cross-platform resolution', () => {
  const { resources, admission, imports } = setup()
  const source = '/api/v1/software/sources/brew/revisions/1'
  admission.handle(
    request(
      source,
      operation(
        {
          action: 'register',
          definition: {
            id: 'brew',
            revision: '1',
            kind: 'brew',
            location: 'example/tap',
            publishers: [],
          },
        },
        0,
      ),
    ),
    'normal',
  )
  admission.handle(
    request(source, operation({ action: 'approve', evidence: ['reviewed'] }, 1)),
    'normal',
  )
  const query = new URLSearchParams({
    source: 'brew',
    revision: '1',
    package: 'example-editor',
    version: '1.0',
    platform: 'macos',
    architecture: 'aarch64',
  })
  const reply = imports.handle(
    request('/api/v1/mdm-candidate/software/import-resolutions', undefined, undefined, query),
    'normal',
  )!
  expect(reply.status).toBe(200)
  const resolution = (reply.body as { resolution: { id: string } }).resolution
  const path = `/api/v1/mdm-candidate/software/imports/${crypto.randomUUID()}`
  imports.handle(
    request(
      path,
      operation(
        {
          action: 'start',
          resolution: resolution.id,
          resource: 'editor',
          version: '1',
          expectedResourceRevision: 0,
        },
        0,
      ),
    ),
    'normal',
  )
  imports.advance('normal')
  expect(resources.read('editor')?.versions[0]?.variants[0]?.declaration).toMatchObject({
    kind: 'software',
    definition: {
      behavior: {
        kind: 'brew',
        install: { runAs: 'logged_in_user', arguments: ['install', 'example-editor@1.0'] },
      },
    },
  })
  query.set('platform', 'windows')
  expect(
    imports.handle(
      request('/api/v1/mdm-candidate/software/import-resolutions', undefined, undefined, query),
      'normal',
    )?.status,
  ).toBe(404)
})

it('returns a closed not-found error for a missing exact external package', () => {
  const { imports, query } = setup()
  query.set('package', 'missing.package')
  const reply = imports.handle(
    request('/api/v1/mdm-candidate/software/import-resolutions', undefined, undefined, query),
    'normal',
  )!
  expect(decodeMdmError(reply.status, reply.body)).toMatchObject({
    cause: 'wire',
    status: 404,
    code: 'operation_not_found',
  })
})
