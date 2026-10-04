import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createDeviceDemo } from './state'
import { request } from '../software/fixtures'
it('binds only an authorized pending enrollment and keeps Agent binding separate', () => {
  const devices = createDeviceDemo(),
    now = Math.floor(Date.now() / 1000)
  const req = request('/api/v1/enrollments', {
    deviceId: 'device-05',
    source: 'agent.builtin',
    password: Buffer.alloc(32, 1).toString('base64url'),
  })
  req.headers['idempotency-key'] = randomUUID()
  const e = devices.handle(req, 'normal')!.body as { enrollmentId: string }
  devices.tick({
    kind: 'enrollment_bind',
    device: 'device-01',
    enrollment: e.enrollmentId,
    at: now,
  })
  expect(devices.facts().find((d) => d.summary.id === 'device-05')!.registrations).toHaveLength(1)
  devices.tick({
    kind: 'enrollment_bind',
    device: 'device-05',
    enrollment: e.enrollmentId,
    at: now,
  })
  const d = devices.facts().find((d) => d.summary.id === 'device-05')!
  expect(d.registrations.find((r) => r.source === 'agent.builtin')).toMatchObject({
    status: 'active',
    generation: 1,
  })
  expect(d.agentBindings).toEqual([])
  devices.tick({ kind: 'agent_binding', device: 'device-05', active: false, at: now + 1 })
  expect(
    devices.facts().find((d) => d.summary.id === 'device-05')!.agentBindings?.[0]?.capabilities,
  ).toEqual([])
  devices.tick({ kind: 'agent_binding', device: 'device-05', active: true, at: now + 2 })
  expect(
    devices.facts().find((d) => d.summary.id === 'device-05')!.agentBindings?.[0]?.capabilities,
  ).toContain('software.execute.v3')
  devices.tick({
    kind: 'enrollment_bind',
    device: 'device-05',
    enrollment: e.enrollmentId,
    at: now + 3,
  })
  expect(devices.facts().find((d) => d.summary.id === 'device-05')!.registrations).toHaveLength(2)
})
