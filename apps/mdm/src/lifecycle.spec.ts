// @vitest-environment jsdom
// UI lifecycle tests use injected use cases; real HTTP/product evidence is owned by e2e/mdm.
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Enrollment } from '@rss/mdm-enrollment'
import type { User } from '@rss/mdm-devices'
import type { Runtime } from './runtime'
import { NativeEnrollment } from './NativeEnrollment'
import { UserPicker } from './UserPicker'

const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222'
let root: Root, host: HTMLDivElement
const createUrl = vi.fn(() => 'blob:unit-profile'),
  revokeUrl = vi.fn()
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
  originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl })
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false
    },
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  createUrl.mockClear()
  revokeUrl.mockClear()
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate)
  else Reflect.deleteProperty(URL, 'createObjectURL')
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke)
  else Reflect.deleteProperty(URL, 'revokeObjectURL')
  vi.unstubAllGlobals()
})
function enrollment(id: string): Enrollment {
  return {
    enrollmentId: id,
    deviceId: 'new-device',
    source: 'mdm.apple',
    status: 'pending',

    expiresAt: 2000000000,
    instructions: {
      platform: 'macos',
      profileUrl: `/api/v1/enrollments/${id}/profile`,
      enrollmentMethod: 'profile_based_device_enrollment',
    },
    progress: {
      profilePrepared: 'observed',
      certificateIssued: false,
      firstAuthenticatedCheckIn: false,
      systemConfirmation: 'unknown',
      managementReady: false,
      diagnostic: 'awaiting_certificate',
    },
  }
}
function native(
  profile: (
    id: string,
    secret: string,
  ) => Promise<{ bytes: ArrayBuffer; contentType: string; filename: string }>,
  cancel = vi.fn(async () => {
    throw { cause: 'transport' }
  }),
) {
  const read = vi.fn(async (id: string) => enrollment(id)),
    runtime = {
      administration: () => ({
        binding: 'unit-session',
        enrollment: {
          selfOptions: async () => ({ channels: [], quotas: { channels: [] } }),
          channels: async () => ({ channels: [] }),
          enrollment: read,
          profile,
          cancel,
        },
      }),
    } as unknown as Runtime
  return {
    read,
    render: () => createElement(NativeEnrollment, { runtime, locale: 'zh', initialEnrollment: a }),
  }
}
function input(label: string): HTMLInputElement {
  const element = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (!element) throw new Error('Expected labeled input')
  return element
}
async function fill(label: string, value: string) {
  await act(async () => {
    const element = input(label)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (element) => element.textContent === text,
  )
  if (!button) throw new Error('Expected named button')
  await act(async () => button.click())
}
async function selectEnrollment(id: string) {
  await fill('注册申请标识', id)
  await click('读取原生注册进度')
}
function profileFile() {
  return {
    bytes: new Uint8Array([1, 2, 3]).buffer,
    contentType: 'application/x-apple-aspen-config',
    filename: 'unit.mobileconfig',
  }
}
it('clears a delivered profile when the enrollment identity changes', async () => {
  const file = profileFile(),
    view = native(async () => file)
  await act(async () => root.render(view.render()))
  await vi.waitFor(() =>
    expect(host.querySelector('input[aria-label="下载原生配置时输入注册密码"]')).not.toBeNull(),
  )
  await fill('下载原生配置时输入注册密码', 'unit-only-password')
  await click('受保护下载 macOS 配置描述文件')
  expect(host.querySelector('a[download]')).not.toBeNull()
  await selectEnrollment(b)
  expect(host.querySelector('a[download]')).toBeNull()
  expect(revokeUrl).toHaveBeenCalledWith('blob:unit-profile')
  expect([...new Uint8Array(file.bytes)]).toEqual([0, 0, 0])
})
it('erases a late profile response from the previous enrollment without disclosing it', async () => {
  let release!: (file: ReturnType<typeof profileFile>) => void
  const pending = new Promise<ReturnType<typeof profileFile>>((resolve) => {
      release = resolve
    }),
    file = profileFile(),
    view = native(async () => pending)
  await act(async () => root.render(view.render()))
  await vi.waitFor(() =>
    expect(host.querySelector('input[aria-label="下载原生配置时输入注册密码"]')).not.toBeNull(),
  )
  await fill('下载原生配置时输入注册密码', 'unit-only-password')
  await click('受保护下载 macOS 配置描述文件')
  await selectEnrollment(b)
  await act(async () => release(file))
  expect(view.read).toHaveBeenLastCalledWith(b)
  expect(createUrl).not.toHaveBeenCalled()
  expect([...new Uint8Array(file.bytes)]).toEqual([0, 0, 0])
})
it('keeps the native enrollment selector locked while its original maintenance is unknown', async () => {
  const view = native(async () => profileFile())
  await act(async () => root.render(view.render()))
  await vi.waitFor(() => expect(host.querySelector('input[type="checkbox"]')).not.toBeNull())
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  await click('取消原注册申请')
  expect(input('注册申请标识').disabled).toBe(true)
  await selectEnrollment(b)
  expect(view.read).not.toHaveBeenCalledWith(b)
})
it('reports account verification to the parent and restores the confirmed selection on failure', async () => {
  let reject!: (error: unknown) => void
  const request = new Promise<never>((_resolve, failure) => {
      reject = failure
    }),
    saved = vi.fn(),
    runtime = {
      tenant: a,
      administration: () => ({
        binding: 'unit-session',
        identity: {
          accounts: async () => ({
            items: [
              { principalId: a, login: 'A' },
              { principalId: b, login: 'B' },
            ],
            nextCursor: null,
          }),
          account: async () => request,
        },
        authorization: { effective: async () => ({ instanceId: a }) },
      }),
    } as unknown as Runtime
  function Form() {
    const [user, setUser] = useState<User | null>({ tenantId: a, instanceId: a, principalId: a }),
      [checking, setChecking] = useState(false)
    return createElement(
      'section',
      null,
      createElement(UserPicker, {
        runtime,
        locale: 'zh',
        value: user,
        onChange: setUser,
        onPendingChange: setChecking,
      }),
      createElement('button', { disabled: checking, onClick: () => saved(user) }, 'Save'),
    )
  }
  await act(async () => root.render(createElement(Form)))
  await vi.waitFor(() =>
    expect(host.querySelector('input[aria-label="选择租户人员"]')).not.toBeNull(),
  )
  await act(async () =>
    host
      .querySelector('input[aria-label="选择租户人员"]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
  )
  await vi.waitFor(() =>
    expect(
      [...document.querySelectorAll('.ant-select-item-option-content')].find(
        (element) => element.textContent === 'B',
      ),
    ).toBeDefined(),
  )
  await act(async () =>
    (
      [...document.querySelectorAll('.ant-select-item-option-content')].find(
        (element) => element.textContent === 'B',
      ) as HTMLElement
    ).click(),
  )
  expect(
    [...host.querySelectorAll('button')].find((element) => element.textContent === 'Save')!
      .disabled,
  ).toBe(true)
  await act(async () => reject({ cause: 'transport' }))
  expect(host.querySelector('[title="A"]')?.textContent).toBe('A')
  await click('Save')
  expect(saved).toHaveBeenCalledWith({ tenantId: a, instanceId: a, principalId: a })
})
