// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OriginalRequests } from './OriginalRequests'
import { AgentPackages } from './AgentPackages'
import { DevicePki } from './DevicePki'
import { SelectionGuard } from './SelectionGuard'
import type { Runtime } from './runtime'
import type { ViewEndpoint } from '@rss/mdm-devices'
let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('crypto', webcrypto)
  const computed = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((e) => computed(e))
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
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
function runtime(admin: object) {
  return {
    administration: () => ({ binding: 'tenant/principal/session', ...admin }),
  } as unknown as Runtime
}
function button(name: string) {
  const result = [...host.querySelectorAll('button')].find((node) => node.textContent === name)
  if (!result) throw new Error('Missing button ' + name)
  return result
}
async function click(name: string) {
  await act(async () => button(name).click())
}
async function render(node: ReturnType<typeof h>) {
  await act(async () => root.render(h(MemoryRouter, null, node)))
}
it('does not show a late original Windows recovery under another request', async () => {
  let resolve!: (value: unknown) => void
  const requests = ['attempt-a', 'attempt-b'].map((attempt) => ({
    attempt,
    device: 'device',
    operationId: 'request-' + attempt,
    activated: false,
    requirements: [],
    signing: { state: 'signed', attempt, issuer: 'issuer' },
  }))
  const windowsRecovery = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    ),
    r = runtime({
      requestHistory: {
        windows: async () => ({ items: requests, nextCursor: null }),
        windowsRequest: async (_device: string, attempt: string) =>
          requests.find((row) => row.attempt === attempt),
        windowsRecoveries: async (_device: string, attempt: string) => ({
          items: [
            {
              operationId: 'recover-' + attempt,
              actor: 'original-actor',
              instance: 'original-instance',
            },
          ],
          nextCursor: null,
        }),
        windowsRecovery,
      },
      authorization: { effective: async () => ({ grants: [] }) },
      devicePki: {},
    })
  await render(
    h(OriginalRequests, {
      runtime: r,
      locale: 'en',
      endpoint: { id: 'device', source: 'mdm.windows' } as ViewEndpoint,
    }),
  )
  await click('attempt-a')
  await click('recover-attempt-a')
  await click('attempt-b')
  await act(async () => resolve({ attempt: 'attempt-a', fingerprint: 'late-recovery-A' }))
  expect(host.textContent).not.toContain('late-recovery-A')
  expect(windowsRecovery).toHaveBeenCalledWith('device', 'attempt-a', {
    operationId: 'recover-attempt-a',
    actor: 'original-actor',
    instance: 'original-instance',
  })
})
it('lets a publish-only operator locate and publish a saved package', async () => {
  const publish = vi.fn(async () => ({ releaseId: 'published' })),
    r = runtime({ agentPackages: { publish }, content: {} })
  await render(
    h(AgentPackages, {
      runtime: r,
      locale: 'en',
      canRead: false,
      canPrepare: false,
      canPublish: true,
      canWithdraw: false,
    }),
  )
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Original package UUID"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'saved-package',
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click('Explicitly publish saved software')
  expect(publish).toHaveBeenCalledWith(expect.any(String), 'saved-package')
  expect(host.textContent).toContain('published')
})
it('confirms an unknown package write only from its matching original receipt, without resubmitting', async () => {
  const publish = vi.fn().mockRejectedValue({ status: 503, code: 'unavailable' }),
    operation = vi.fn(),
    r = runtime({ agentPackages: { publish, operation }, content: {} })
  await render(
    h(AgentPackages, {
      runtime: r,
      locale: 'en',
      canRead: false,
      canPrepare: false,
      canPublish: true,
      canWithdraw: false,
    }),
  )
  const packageInput = host.querySelector<HTMLInputElement>(
      'input[aria-label="Original package UUID"]',
    )!,
    operationInput = host.querySelector<HTMLInputElement>(
      'input[aria-label="Original package operation UUID"]',
    )!
  async function fill(input: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  await fill(packageInput, 'saved-package')
  await click('Explicitly publish saved software')
  const original = publish.mock.calls[0]![0]
  async function read(value: unknown) {
    operation.mockResolvedValueOnce(value)
    await click('Read original package operation')
  }
  function canFinish() {
    return [...host.querySelectorAll('button')].some(
      (node) => node.textContent === 'Finish this operation',
    )
  }
  await read(null)
  expect(canFinish()).toBe(false)
  await read({ withdrawn: 'saved-package' })
  expect(canFinish()).toBe(false)
  await fill(operationInput, 'another-operation')
  expect([...host.querySelectorAll('code')].map((node) => node.textContent)).toContain(original)
  await read({ releaseId: 'another-release' })
  expect(canFinish()).toBe(false)
  await fill(operationInput, original)
  await read({ releaseId: 'confirmed-original-release' })
  expect(canFinish()).toBe(true)
  expect(packageInput.disabled).toBe(true)
  await click('Finish this operation')
  expect(packageInput.disabled).toBe(false)
  expect(publish).toHaveBeenCalledOnce()
  expect(operation).toHaveBeenLastCalledWith(original)
})
it('releases a confirmed package task so another original installer can be selected', async () => {
  const target = {
      resource: 'resource',
      filename: 'agent.zip',
      artifact: { reference: 'content', length: 1, sha256: Array(32).fill(0) },
    },
    session = {
      purpose: 'software',
      id: 'upload',
      target,
      offset: 1,
      complete: false,
      actor: 'actor',
    }
  const prepare = vi.fn(async () => ({
      resource: 'resource',
      upload: 'upload',
      packageId: 'package',
    })),
    complete = vi.fn(async () => {})
  const r = runtime({
    agentPackages: { prepare },
    content: {
      read: async () => session,
      prepared: () => ({ purpose: 'software', id: 'upload', target }),
      complete,
    },
  })
  await render(
    h(AgentPackages, {
      runtime: r,
      locale: 'en',
      canRead: false,
      canPrepare: true,
      canPublish: false,
      canWithdraw: false,
    }),
  )
  // A real bounded file slice is hashed before Software preparation.
  const digest = new Uint8Array(await webcrypto.subtle.digest('SHA-256', new Uint8Array([7])))
  target.artifact.sha256 = [...digest]
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Select Agent installer"]')!
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [
      {
        name: 'agent.zip',
        size: 1,
        slice: () => ({ arrayBuffer: async () => new Uint8Array([7]).buffer }),
      },
    ],
  })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((done) => setTimeout(done, 30))
  })
  await click('Explicitly prepare this upload')
  expect(input.disabled).toBe(true)
  const finish = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === 'Finish this package and prepare another',
  )
  expect(finish).toBeUndefined()
  await click('Complete original upload')
  await click('Finish this package and prepare another')
  expect(input.disabled).toBe(false)
  expect(host.querySelector('.mapping-upload')).toBeNull()
  expect(
    host.querySelector<HTMLInputElement>('input[aria-label="Original package UUID"]')?.value,
  ).toBe('')
  expect(complete).toHaveBeenCalledOnce()
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((done) => setTimeout(done, 30))
  })
  await click('Explicitly prepare this upload')
  expect(prepare).toHaveBeenCalledTimes(2)
})
it('retains an unknown PKI transition and blocks starting another server action', async () => {
  const rotation = {
    id: '11111111-1111-4111-8111-111111111111',
    state: 'distributing',
    distributionRevision: 1,
    trustRevision: 1,
    previous: { digest: 'old', state: 'active' },
    candidate: { digest: 'new', state: 'prepared' },
    activeIssuer: 'old',
    action: 'activate',
    blockers: ['missing_ack'],
    preconditions: [],
    providerVerification: 'not_evaluated',
    operations: [],
    evaluatedAt: 1,
  }
  const readRotation = vi.fn(async () => rotation)
  const transition = vi.fn().mockRejectedValue({ status: 503, code: 'operation_unknown' }),
    r = runtime({
      devicePki: {
        trust: async () => ({
          revision: 1,
          issuers: [],
          serviceId: 'service',
          tenant: 'tenant',
          origin: 'https://mdm.test',
        }),
        latestRotation: async () => rotation,
        rotation: readRotation,
        rotationBlockers: async () => ({ items: [], nextCursor: null }),
        transition,
      },
    })
  await render(h(DevicePki, { runtime: r, locale: 'en', canManage: true }))
  let current = [...host.querySelectorAll('button')].find((node) =>
    node.textContent?.startsWith('Explicitly continue the current server action'),
  )!
  expect(current.disabled).toBe(true)
  expect(transition).not.toHaveBeenCalled()
  const locator = host.querySelector<HTMLInputElement>(
    'input[aria-label="Original rotation UUID"]',
  )!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      locator,
      rotation.id,
    )
    locator.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click('Read original rotation')
  expect(readRotation).toHaveBeenCalledOnce()
  rotation.blockers = []
  await click('Read original rotation')
  expect(readRotation).toHaveBeenCalledTimes(2)
  current = [...host.querySelectorAll('button')].find((node) =>
    node.textContent?.startsWith('Explicitly continue the current server action'),
  )!
  await act(async () => current.click())
  expect(transition).toHaveBeenCalledOnce()
  expect(current.disabled).toBe(true)
  await act(async () => current.click())
  expect(transition).toHaveBeenCalledOnce()
  expect(host.textContent).toContain('Original operation')
})

it('keeps the original request and outer device selection fenced while a real recovery owner is unknown', async () => {
  const device = '33333333-3333-4333-8333-333333333333',
    a = '11111111-1111-4111-8111-111111111111',
    b = '22222222-2222-4222-8222-222222222222'
  const requests = [a, b].map((id) => ({
    id,
    device,
    operationId: id,
    state: 'authorized',
    activated: false,
    requirements: [],
    issuance: id,
    actor: 'actor',
    instance: 'instance',
  }))
  const recoverIssuance = vi.fn().mockRejectedValue({ status: 503, code: 'operation_unknown' }),
    outer = vi.fn()
  const r = runtime({
    requestHistory: {
      agents: async () => ({ items: requests, nextCursor: 'next' }),
      agent: async (_device: string, id: string) => requests.find((row) => row.id === id),
    },
    devicePki: { recoverIssuance },
    authorization: {
      effective: async () => ({
        grants: [{ operation: 'credentials', scope: { kind: 'device', id: device } }],
      }),
    },
  })
  await render(
    h(
      SelectionGuard.Provider,
      { value: outer },
      h(OriginalRequests, {
        runtime: r,
        locale: 'en',
        endpoint: {
          id: device,
          source: 'agent.builtin',
          channel: 'agent',
          platform: { state: 'known', values: ['macos'] },
          status: 'active',
          assetState: 'active',
          registeredAt: null,
          lastCommunicationReceivedAt: null,
          enrollment: null,
        },
      }),
    ),
  )
  await click(a)
  const label = [...host.querySelectorAll('label')].find(
    (node) => node.textContent === 'Certificate chain signed by the original CA',
  )!
  const chain = document.getElementById(label.htmlFor) as HTMLTextAreaElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      chain,
      'AQID',
    )
    chain.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    button('Link original signing result')
      .closest('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(recoverIssuance).toHaveBeenCalledWith(expect.objectContaining({ issuance: a }))
  expect(button(b).disabled).toBe(true)
  expect(button('Next requests').disabled).toBe(true)
  await click(b)
  expect(host.textContent).toContain('Administrator recovery operation')
  expect(outer.mock.calls.some((call) => call[1] === true)).toBe(true)
  expect(recoverIssuance).toHaveBeenCalledOnce()
})
