import { expect, it, vi } from 'vitest'
import axios from 'axios'
import AxiosMockAdapter from 'axios-mock-adapter'
import { createMdmTransport, decodeMdmError } from './mdm'
import { postApiV1GroupsById, getApiV1PoliciesByIdAssignments } from './generated/mdm'

it('accepts product and embedded authentication errors without exposing server detail', () => {
  expect(decodeMdmError(403, { code: 'csrf_rejected' })).toMatchObject({
    cause: 'wire',
    code: 'csrf_rejected',
  })
  expect(decodeMdmError(503, { code: 'operation_unknown' })).toMatchObject({
    cause: 'wire',
    code: 'operation_unknown',
  })
  expect(
    decodeMdmError(409, { code: 'stale_plan', device: null, stage: 'capability' }),
  ).toMatchObject({ cause: 'protocol' })
  expect(decodeMdmError(409, { code: 'stale_plan', device: {}, stage: 'capability' }).cause).toBe(
    'protocol',
  )
  expect(decodeMdmError(401, { code: 'permission_denied' }).cause).toBe('protocol')
})

it('decodes the current Agent pause envelope without classifying a rejected create as unknown', () => {
  expect(decodeMdmError(409, { code: 'enrollment_paused', issuanceId: null })).toMatchObject({
    cause: 'wire',
    status: 409,
    code: 'enrollment_paused',
  })
  expect(decodeMdmError(409, { code: 'enrollment_paused', issuanceId: 'bad' }).cause).toBe(
    'protocol',
  )
  expect(decodeMdmError(429, { code: 'enrollment_paused', issuanceId: null }).cause).toBe(
    'protocol',
  )
})

it('preserves closed connection and package rejection reasons while rejecting malformed status/envelopes', () => {
  for (const code of ['connection_deployment_unobserved', 'connection_retirement_blocked']) {
    expect(decodeMdmError(409, { code, issuanceId: null })).toMatchObject({ cause: 'wire', code })
    expect(decodeMdmError(400, { code, issuanceId: null }).cause).toBe('protocol')
    expect(decodeMdmError(409, { code, issuanceId: null, detail: 'secret' }).cause).toBe('protocol')
  }
  for (const code of [
    'agent_package_installer_mismatch',
    'agent_package_lifecycle_not_admitted',
    'agent_package_source_not_admitted',
    'agent_package_binding_not_admitted',
  ]) {
    expect(decodeMdmError(409, { code })).toMatchObject({ cause: 'wire', code })
    expect(decodeMdmError(409, { code, detail: 'secret' }).cause).toBe('protocol')
  }
})

it('rejects raw domain requests instead of accepting a parallel handwritten contract', async () => {
  const transport = createMdmTransport()
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v1/policies',
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'client' })
})
it('keeps caller credentials and tenant authority out of generated requests', async () => {
  for (const header of ['Authorization', 'X-Tenant-ID', 'X-CSRF-Token'])
    await expect(
      getApiV1PoliciesByIdAssignments(createMdmTransport(), {
        pathParams: { id: '11111111-1111-4111-8111-111111111111' },
        headers: { [header]: 'secret' },
      }),
    ).rejects.toMatchObject({ cause: 'client' })
})
it('enforces the complete UTF-8 JSON ingress budget on generated operations', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance),
    spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance)
  const transport = createMdmTransport()
  spy.mockRestore()
  const id = '11111111-1111-4111-8111-111111111111'
  const body = {
    operationId: id,
    expectedRevision: 0,
    input: { action: 'edit' as const, presentation: { extension: '' } },
  }
  const base = new TextEncoder().encode(JSON.stringify(body)).byteLength
  mock.onPost(`/api/v1/groups/${id}`).reply(
    200,
    {
      operation: id,
      group: {
        id,
        kind: 'static',
        systemSelector: null,
        assetContext: 'endpoint',
        presentation: {},
        revision: 1,
        calculationRevision: 1,
        memberVersion: 1,
        memberCount: 0,
        ruleVersion: null,
        deleted: false,
      },
      added: 0,
      removed: 0,
      task: null,
    },
    { 'Content-Type': 'application/json' },
  )
  body.input.presentation.extension = 'a'.repeat(16384 - base)
  await postApiV1GroupsById(transport, { pathParams: { id }, body })
  body.input.presentation.extension += '界'
  await expect(postApiV1GroupsById(transport, { pathParams: { id }, body })).rejects.toMatchObject({
    status: 413,
    cause: 'wire',
    code: 'request_too_large',
  })
  expect(mock.history.post).toHaveLength(1)
  expect(new TextEncoder().encode(mock.history.post[0]!.data).byteLength).toBe(16384)
  mock.restore()
})
