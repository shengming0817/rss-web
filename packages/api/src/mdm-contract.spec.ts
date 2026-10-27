import { describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { createMdmTransport } from './mdm'
import { createMdmDemoTransport } from './mdm-demo'
import {
  getApiV1PoliciesByIdAssignments,
  getApiV1AssetFields,
  getApiV1ResourcesByIdVersionsByVersionScript,
  postApiV1ResourcesByIdUploadsByUploadComplete,
  getReadyz,
} from './generated/mdm'
import { validateTaskAdmission, validatePolicyDefinition } from './generated/mdm/owner-validators'
import { safeJson } from './mdm-contract-response'
import type { HttpTransport, RequestOptions, NoContentRequest } from './types'

const id = '11111111-1111-4111-8111-111111111111'
describe('fixed producer HTTP operations', () => {
  it('keeps unpublished requests in the explicit loopback demo composition', async () => {
    vi.stubGlobal('window', { location: { hostname: 'production.example' } })
    expect(() => createMdmDemoTransport()).toThrow()
    vi.stubGlobal('window', { location: { hostname: '127.0.0.1' } })
    const instance = axios.create(),
      mock = new MockAdapter(instance),
      spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
    try {
      const transport = createMdmDemoTransport()
      mock.onGet('/api/v1/mdm-candidate/security/risks').reply(200, { items: [] })
      await expect(
        transport.request({
          method: 'GET',
          path: '/api/v1/mdm-candidate/security/risks',
          successStatus: 200,
          decode: (v) => v,
        }),
      ).resolves.toEqual({ items: [] })
      await expect(
        transport.request({
          method: 'GET',
          path: '/api/v1/devices',
          successStatus: 200,
          decode: (v) => v,
        }),
      ).rejects.toMatchObject({ cause: 'client' })
    } finally {
      spy.mockRestore()
      mock.restore()
      vi.unstubAllGlobals()
    }
  })
  it('accepts the complete producer state union and optional nullable stage without mutation', () => {
    for (const state of [
      'installation_pending',
      'recovery_observation_pending',
      'recovery_retry_exhausted',
      'mdm_software_disabled',
      'projection_pending',
    ]) {
      for (const value of [{ state }, { state, stage: null }, { state, stage: 0 }]) {
        const before = structuredClone(value)
        expect(validateTaskAdmission(value)).toBe(true)
        expect(value).toEqual(before)
      }
    }
    expect(validateTaskAdmission({ state: 'future_state' })).toBe(false)
    expect(validateTaskAdmission({ state: 'eligible', stage: '1' })).toBe(false)
  })
  it('rejects out of budget requests before invoking transport', async () => {
    const request = vi.fn()
    const transport = { request } as HttpTransport
    await expect(getApiV1AssetFields(transport, { query: { limit: 1001 } })).rejects.toMatchObject({
      cause: 'client',
    })
    await expect(
      getApiV1PoliciesByIdAssignments(transport, { pathParams: { id }, query: { limit: 0 } }),
    ).rejects.toMatchObject({ cause: 'client' })
    expect(request).not.toHaveBeenCalled()
    await getApiV1AssetFields(transport, { query: { limit: 1000 } })
    expect(request).toHaveBeenCalledOnce()
  })
  it('binds method/path/status and encodes scalar and tuple path carriers', async () => {
    const request = vi.fn(async (options: RequestOptions<unknown> | NoContentRequest) =>
      options.decode?.({ items: [], nextCursor: null }),
    )
    await getApiV1PoliciesByIdAssignments({ request } as HttpTransport, {
      pathParams: { id },
      query: { limit: 1, cursor: 'YQ' },
    })
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      method: 'GET',
      path: '/api/v1/policies/{id}/assignments',
      successStatus: 200,
      query: { limit: 1, cursor: 'YQ' },
    })
    expect(getApiV1ResourcesByIdVersionsByVersionScript.url({ id: 'script', version: '1' })).toBe(
      '/api/v1/resources/script/versions/1/script',
    )
    expect(() =>
      getApiV1ResourcesByIdVersionsByVersionScript.url({ id: '..', version: '1' }),
    ).toThrow()
  })
  it('uses real status and media before exposing a response', async () => {
    const instance = axios.create(),
      mock = new MockAdapter(instance)
    const create = vi.spyOn(axios, 'create').mockReturnValue(instance)
    try {
      const transport = createMdmTransport()
      mock
        .onGet(`/api/v1/policies/${id}/assignments`)
        .reply(200, { items: [], nextCursor: null }, { 'Content-Type': 'application/json' })
      await expect(
        getApiV1PoliciesByIdAssignments(transport, { pathParams: { id } }),
      ).resolves.toEqual({ items: [], nextCursor: null })
      mock.resetHandlers()
      mock
        .onGet(`/api/v1/policies/${id}/assignments`)
        .reply(201, { items: [], nextCursor: null }, { 'Content-Type': 'application/json' })
      await expect(
        getApiV1PoliciesByIdAssignments(transport, { pathParams: { id } }),
      ).rejects.toMatchObject({ cause: 'protocol', status: 201 })
      mock.resetHandlers()
      mock
        .onGet(`/api/v1/policies/${id}/assignments`)
        .reply(200, { items: [], nextCursor: null }, { 'Content-Type': 'text/plain' })
      await expect(
        getApiV1PoliciesByIdAssignments(transport, { pathParams: { id } }),
      ).rejects.toMatchObject({ cause: 'protocol', status: 200 })
    } finally {
      create.mockRestore()
      mock.restore()
    }
  })
  it('keeps empty acknowledgement and readiness branches explicit', async () => {
    const request = vi.fn().mockResolvedValue(undefined),
      transport = { request } as HttpTransport
    await postApiV1ResourcesByIdUploadsByUploadComplete(transport, {
      pathParams: { id: 'script', upload: id },
    })
    expect(request.mock.calls[0]?.[0]).toMatchObject({ successStatus: 201, responseType: 'empty' })
    await getReadyz(transport, {})
    expect(request.mock.calls[1]?.[0]).toMatchObject({ successStatus: [200, 503] })
  })
  it('preserves Policy extensions and distinguishes missing/null core fields', () => {
    const definition = {
      customEvent: null,
      alias: null,
      scope: id,
      action: {
        kind: 'configuration',
        resource: {
          id: 'r',
          version: '1',
          variant: 'default',
          platform: 'macos',
          architecture: 'aarch64',
        },
        exit: 'retain',
      },
    }
    expect(validatePolicyDefinition(definition)).toBe(true)
    const missing: Record<string, unknown> = { ...definition }
    delete missing['customEvent']
    expect(validatePolicyDefinition(missing)).toBe(false)
    expect(validatePolicyDefinition({ ...definition, action: { kind: 'unknown' } })).toBe(false)
    expect(() => safeJson({ revision: Number.MAX_SAFE_INTEGER + 1 })).toThrow()
    expect(() => safeJson({ value: Infinity })).toThrow()
  })
  it('does not accept retired pagination fields through generated inputs', async () => {
    const request = vi.fn(),
      transport = { request } as HttpTransport
    const query: unknown = { limit: 1, after: id }
    // Deliberate untyped ingress: runtime validation must also reject old callers.
    await expect(
      getApiV1PoliciesByIdAssignments(transport, {
        pathParams: { id },
        query: query as { limit: number },
      }),
    ).rejects.toMatchObject({ cause: 'client' })
    expect(request).not.toHaveBeenCalled()
  })
})
