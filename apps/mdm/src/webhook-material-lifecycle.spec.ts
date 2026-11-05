// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Material, MaterialInput, Webhooks } from '@rss/mdm-webhooks'
import { useWebhookMaterial } from './useWebhookMaterial'
import { SecretPanel } from './SecretTabs'

const operationId = '33333333-3333-4333-8333-333333333333',
  secret = 'whsec_' + btoa('s'.repeat(32)),
  input: MaterialInput = {
    reference: 'signing',
    expectedRevision: 4,
    configurationSha256: 'a'.repeat(64),
    endpoint: 'https://receiver.example/confirm',
    networkReference: 'network',
    source: { kind: 'import', secret },
  },
  material: Material = {
    operationId,
    reference: input.reference,
    revision: 5,
    configurationSha256: input.configurationSha256,
    endpoint: input.endpoint,
    networkReference: input.networkReference,
    keyDigest: 'b'.repeat(64),
    challenge: 'public',
    confirmed: false,
    revoked: false,
    attemptedAt: null,
    confirmedAt: null,
    failureReason: null,
  }
let root: Root, host: HTMLDivElement, command: ReturnType<typeof useWebhookMaterial>
const clearInputs = vi.fn()
function Harness({
  webhooks,
  canWrite = true,
  canRead = true,
}: {
  webhooks: Webhooks
  canWrite?: boolean
  canRead?: boolean
}) {
  command = useWebhookMaterial(webhooks, canRead, canWrite, clearInputs)
  return h('div', null, command.outcome)
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('crypto', webcrypto)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  clearInputs.mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('keeps an unknown imported request without its secret and rejects missing or mismatched original receipts', async () => {
  const prepare = vi
      .fn<Webhooks['prepare']>()
      .mockRejectedValue({ code: 'operation_unknown', status: 503 }),
    materialOperation = vi
      .fn<Webhooks['materialOperation']>()
      .mockRejectedValueOnce({ code: 'not_found', status: 404 })
      .mockResolvedValueOnce({ ...material, reference: 'another' })
      .mockResolvedValueOnce(material),
    webhooks = { prepare, materialOperation } as unknown as Webhooks
  await act(async () => root.render(h(Harness, { webhooks })))
  await act(async () => {
    await command.prepare(operationId, input)
  })
  expect(command.outcome).toBe('unknown')
  expect(JSON.stringify(command.pending)).not.toContain(secret)
  await act(async () => {
    await command.lookup()
    command.next()
  })
  expect(command.outcome).toBe('unknown')
  expect(command.pending?.operationId).toBe(operationId)
  await act(async () => {
    await command.lookup()
  })
  expect(command.outcome).toBe('unknown')
  expect(command.receipt).toBeNull()
  await act(async () => {
    await command.lookup()
  })
  expect(command.outcome).toBe('unknown')
  expect(command.receipt).toBeNull()
  expect(command.observed).toEqual(material)
  expect(prepare).toHaveBeenCalledTimes(1)
  prepare.mockResolvedValueOnce(material)
  await act(async () => {
    await command.replay(secret)
  })
  expect(command.outcome).toBe('confirmed')
  expect(command.receipt).toEqual(material)
  expect(prepare).toHaveBeenCalledTimes(2)
  expect(prepare.mock.calls[1]).toEqual(prepare.mock.calls[0])
})
it('clears hidden inputs and retains original public inputs across authority changes, requiring the identical imported secret', async () => {
  const prepare = vi
      .fn<Webhooks['prepare']>()
      .mockRejectedValueOnce({ code: 'operation_unknown', status: 503 })
      .mockResolvedValue(material),
    webhooks = { prepare } as unknown as Webhooks,
    render = async (canWrite: boolean, active: boolean) =>
      act(async () =>
        root.render(h(SecretPanel, { active, children: h(Harness, { webhooks, canWrite }) })),
      )
  await render(true, true)
  await act(async () => {
    await command.prepare(operationId, input)
  })
  const original = command.pending
  await render(false, false)
  expect(clearInputs).toHaveBeenCalled()
  expect(command.receipt).toBeNull()
  expect(command.pending).toEqual(original)
  await render(true, true)
  await act(async () => {
    await command.replay('whsec_' + btoa('x'.repeat(32)))
  })
  expect(command.outcome).toBe('unknown')
  expect(prepare).toHaveBeenCalledTimes(1)
  await act(async () => {
    await command.replay(secret)
  })
  expect(prepare).toHaveBeenCalledTimes(2)
  expect(prepare.mock.calls[1]).toEqual(prepare.mock.calls[0])
  expect(command.outcome).toBe('confirmed')
})
it('drops preparation before HTTP when the panel hides during private input comparison', async () => {
  const prepare = vi.fn<Webhooks['prepare']>(),
    webhooks = { prepare } as unknown as Webhooks
  await act(async () => root.render(h(Harness, { webhooks })))
  const original = crypto.subtle.digest.bind(crypto.subtle),
    digest = vi.spyOn(crypto.subtle, 'digest')
  let release!: () => void
  digest.mockImplementation(async (...args) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return original(...args)
  })
  let pending!: Promise<unknown>
  await act(async () => {
    pending = command.prepare(operationId, input)
    await Promise.resolve()
  })
  await act(async () => window.dispatchEvent(new Event('pagehide')))
  await act(async () => {
    release()
    await pending
  })
  expect(prepare).not.toHaveBeenCalled()
  expect(command.pending).toBeNull()
})

it.each(['activate', 'revoke', 'retire_previous'] as const)(
  'does not acknowledge a rejected %s request from another transition record with matching public coordinates',
  async (kind) => {
    const transition = vi
        .fn<Webhooks['transition']>()
        .mockRejectedValue({ code: 'operation_conflict', status: 409 }),
      recorded = {
        operationId,
        reference: 'signing',
        revision: 5,
        activeRevision: 4,
        retiringRevision: null,
      },
      materialOperation = vi.fn<Webhooks['materialOperation']>().mockResolvedValue(recorded),
      webhooks = { transition, materialOperation } as unknown as Webhooks
    await act(async () => root.render(h(Harness, { webhooks })))
    await act(async () => {
      await command.transition(operationId, {
        reference: 'signing',
        expectedRevision: 4,
        action:
          kind === 'retire_previous'
            ? { kind }
            : { kind, materialRevision: kind === 'activate' ? 4 : 3 },
      })
    })
    expect(command.outcome).toBe('rejected')
    await act(async () => {
      await command.lookup()
    })
    expect(command.outcome).toBe('rejected')
    expect(command.receipt).toBeNull()
    expect(command.observed).toEqual(recorded)
    expect(transition).toHaveBeenCalledTimes(1)
  },
)
it.each(['generate', 'import'] as const)(
  'does not confirm a rejected %s intent from a material record that omits its source and private-input fingerprint',
  async (kind) => {
    const prepare = vi
        .fn<Webhooks['prepare']>()
        .mockRejectedValue({ code: 'operation_conflict', status: 409 }),
      materialOperation = vi.fn<Webhooks['materialOperation']>().mockResolvedValue(material),
      webhooks = { prepare, materialOperation } as unknown as Webhooks
    await act(async () => root.render(h(Harness, { webhooks })))
    await act(async () => {
      await command.prepare(operationId, {
        ...input,
        source: kind === 'generate' ? { kind } : { kind, secret },
      })
    })
    await act(async () => {
      await command.lookup()
    })
    expect(command.outcome).toBe('rejected')
    expect(command.receipt).toBeNull()
    expect(command.observed).toEqual(material)
    expect(prepare).toHaveBeenCalledTimes(1)
  },
)
