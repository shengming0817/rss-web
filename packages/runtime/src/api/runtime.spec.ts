import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api'
import { createRuntimeApi } from './client'
import { decodeRuntimeInventoryResponse } from './decoders'

const digest = `sha256:${'a'.repeat(64)}`
const valid = {
  data: {
    schemaVersion: 1,
    assemblyFingerprint: digest,
    buildMetadata: { sourceRevision: 'b'.repeat(40), imageDigest: digest },
    runtimePlanFingerprint: digest,
    activatedWorkflows: [
      {
        mode: 'projection',
        id: 'audit-log',
        definitionVersion: 'v1',
        definitionSchemaDigest: digest,
        activation: 'shadow',
      },
      {
        mode: 'saga',
        id: 'rotate',
        definitionVersion: 'v2',
        definitionSchemaDigest: digest,
        activation: 'active',
      },
    ],
    domains: ['identity', 'audit'],
    listeners: [
      {
        id: 'admin-main',
        kind: 'admin',
        endpoint: { scheme: 'http', host: '127.0.0.1', port: 8081 },
        authScheme: 'rssAccessToken',
      },
    ],
    providerPosture: [{ id: 'ledger', state: 'unobserved' }],
    placements: [{ domain: 'audit', workload: 'audit', mode: 'local', readiness: 'ready' }],
  },
} as const

describe('runtime inventory decoder', () => {
  it('strictly decodes the current schema including unobserved', () => {
    expect(decodeRuntimeInventoryResponse(valid)).toEqual(valid)
  })

  it('decodes optional absence and reviewed remote placement coordinates', () => {
    const { buildMetadata: _buildMetadata, ...withoutBuild } = valid.data
    void _buildMetadata
    const fixture = {
      data: {
        ...withoutBuild,
        placements: [
          {
            domain: 'audit',
            workload: 'remote-audit',
            mode: 'remote',
            endpoint: { scheme: 'https', host: 'audit.internal', port: 443 },
            spiffeIdentity: 'spiffe://rss/audit',
            readiness: 'mtls-source-unavailable',
          },
        ],
      },
    } as const
    expect(decodeRuntimeInventoryResponse(fixture)).toEqual(fixture)
  })

  it.each([
    { ...valid, extra: true },
    { data: { ...valid.data, schemaVersion: 2 } },
    { data: { ...valid.data, providerPosture: [{ id: 'ledger', state: 'unknown' }] } },
    { data: { ...valid.data, assemblyFingerprint: 'bad' } },
    {
      data: {
        ...valid.data,
        listeners: [
          { ...valid.data.listeners[0], endpoint: { scheme: 'http', host: 'x', port: 0 } },
        ],
      },
    },
    {
      data: {
        ...valid.data,
        activatedWorkflows: [
          {
            mode: 'saga',
            id: 'x',
            definitionVersion: 'v1',
            definitionSchemaDigest: digest,
            activation: 'shadow',
          },
        ],
      },
    },
    { data: { ...valid.data, domains: [] } },
    { data: { ...valid.data, domains: ['audit', 'audit'] } },
    { data: { ...valid.data, listeners: 'not-an-array' } },
    { data: { ...valid.data, buildMetadata: { sourceRevision: 'bad', imageDigest: digest } } },
  ])('fails closed for schema drift %#', (fixture) => {
    expect(() => decodeRuntimeInventoryResponse(fixture)).toThrow(
      'invalid runtime inventory response',
    )
  })
})

describe('runtime client', () => {
  it('maps the exact protected coordinate and signal', async () => {
    const signal = new AbortController().signal
    const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(valid))
    const api = createRuntimeApi({ request } as unknown as HttpTransport)
    await expect(api.inventory({ signal })).resolves.toEqual(valid)
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/runtime/inventory',
        successStatus: 200,
        session: 'required',
        signal,
      }),
    )
    await api.inventory()
    expect(request).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ signal: expect.anything() }),
    )
  })
})
