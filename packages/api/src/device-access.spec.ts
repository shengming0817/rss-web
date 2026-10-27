import { getApiV1DevicesByDeviceDeviceAccess } from './generated/mdm'
import { it, expect, vi } from 'vitest'
import axios from 'axios'
import AxiosMockAdapter from 'axios-mock-adapter'
import { createDeviceAccessTransport } from './device-access'
import { createDeviceAccessDemoTransport } from './device-access-demo'
it('separates public DA routes from explicit demo and credential transports', async () => {
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance),
    spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance),
    transport = createDeviceAccessTransport()
  spy.mockRestore()
  mock.onAny().reply(200, { items: [], nextCursor: null }, { 'Content-Type': 'application/json' })
  await getApiV1DevicesByDeviceDeviceAccess(transport, { pathParams: { device: 'space device' } })
  expect(mock.history.get[0]?.url).toBe('/api/v1/devices/space%20device/device-access')
  for (const path of [
    '/api/da-demo/computers',
    '/api/v1/identity/tenants/a/login',
    '/api/v1/agent/runtime/tasks',
    'https://example.test',
  ])
    await expect(
      transport.request({ method: 'GET', path, successStatus: 200, decode: (v) => v }),
    ).rejects.toMatchObject({ cause: 'client' })
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v1/devices',
      headers: { Authorization: 'not permitted' },
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'client' })
  mock.restore()
})
it('allows candidate endpoints only through a loopback-only explicit demo factory', async () => {
  vi.stubGlobal('window', { location: { hostname: 'evil.example' } })
  expect(() => createDeviceAccessDemoTransport()).toThrow()
  vi.stubGlobal('window', { location: { hostname: '127.0.0.1' } })
  const instance = axios.create(),
    mock = new AxiosMockAdapter(instance),
    spy = vi.spyOn(axios, 'create').mockReturnValueOnce(instance),
    transport = createDeviceAccessDemoTransport()
  spy.mockRestore()
  mock.onAny().reply(200, { items: [] })
  await transport.request({
    method: 'GET',
    path: '/api/da-demo/computers',
    successStatus: 200,
    decode: (v) => v,
  })
  expect(mock.history.get).toHaveLength(1)
  await expect(
    transport.request({
      method: 'GET',
      path: '/api/v1/devices',
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ cause: 'client' })
  mock.restore()
  vi.unstubAllGlobals()
})
