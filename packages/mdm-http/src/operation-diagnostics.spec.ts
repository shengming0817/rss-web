import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createOperationDiagnostics } from '@rss/mdm-audit'
import { createOperationDiagnosticsAdapter } from './operation-diagnostics'

const id = '11111111-1111-4111-8111-111111111111'
const empty = { items: [], nextCursor: null, coverage: { complete: false } }

it.each([
  ['mdm', '/api/v1'],
  ['da', '/api/v1/device-access'],
  ['management', '/api/v1/tenant-administration'],
] as const)('binds the %s reads to its generated operations', async (context, prefix) => {
  const owner = context === 'management' ? 'tenant_administration' : 'device_control'
  const request = vi.fn(async (input: RequestOptions<unknown>) =>
    input.decode(
      input.path.includes('/operations/')
        ? {
            operation: {
              product: 'mdm',
              owner,
              operationId: id,
              actor: null,
              instance: null,
              device: null,
              target: null,
              registration: null,
              generation: null,
            },
            originalResult: { availability: 'no_durable_evidence' },
            requestEvidence: { availability: 'restricted' },
            auditEvidence: { availability: 'unavailable' },
            executionEvidence: { availability: 'expired' },
            originalResultUrl: null,
            currentResourceUrl: null,
          }
        : empty,
    ),
  )
  const client = createOperationDiagnostics(
    createOperationDiagnosticsAdapter({ request } as unknown as HttpTransport, context),
  )
  const base = prefix + '/operation-diagnostics'
  const signal = new AbortController().signal
  expect(await client.search({ device: 'endpoint', from: 1, until: 2 }, signal)).toEqual(empty)
  await client.request(id, {})
  const result = await client.operation(
    { owner, operationId: id },
    { includeAudit: true, cursor: 'cursor' },
  )
  expect(result).toMatchObject({
    requestEvidence: { availability: 'restricted' },
    executionEvidence: { availability: 'expired' },
  })
  expect(request.mock.calls.map(([options]) => [options.method, options.path])).toEqual([
    ['GET', base],
    ['GET', base + '/requests/{requestId}'],
    ['GET', base + '/operations/{owner}/{operationId}'],
  ])
  expect(request.mock.calls[0]?.[0].signal).toBe(signal)
  expect(request.mock.lastCall?.[0].query).toEqual({ includeAudit: true, cursor: 'cursor' })
  await expect(client.operation({ owner, operationId: id }, { cursor: 'cursor' })).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(3)
})

it('retains delivery, asynchronous progress and effect from the generated RunState', async () => {
  const request = vi.fn(async (input: RequestOptions<unknown>) =>
    input.decode({
      operation: {
        product: 'mdm',
        owner: 'device_action',
        operationId: id,
        actor: null,
        instance: null,
        device: 'endpoint',
        target: null,
        registration: null,
        generation: null,
      },
      originalResult: { availability: 'not_found' },
      requestEvidence: { availability: 'not_requested' },
      auditEvidence: { availability: 'not_requested' },
      executionEvidence: {
        availability: 'available',
        value: {
          owner: 'device',
          state: {
            delivery: { kind: 'received', attempt: id, leaseUntil: 15 },
            execution: 'waiting_reboot',
            cancellation: 'none',
            deadline: 20,
            startedAt: 1,
          },
          result: null,
          effect: 'waiting',
        },
      },
      originalResultUrl: null,
      currentResourceUrl: null,
    }),
  )
  const client = createOperationDiagnostics(
    createOperationDiagnosticsAdapter({ request } as unknown as HttpTransport, 'mdm'),
  )
  expect(
    (await client.operation({ owner: 'device_action', operationId: id, device: 'endpoint' }))
      .executionEvidence,
  ).toEqual({
    availability: 'available',
    value: { owner: 'device', delivery: 'received', state: 'waiting_reboot', effect: 'waiting' },
  })
})
