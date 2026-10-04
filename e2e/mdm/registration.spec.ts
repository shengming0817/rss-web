/** Real registration HTTP consumer; the MDM T2 owner supplies isolated authority and PostgreSQL. */
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { expect, it } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
import { createRegistrationClient } from '../../apps/mdm/src/features/devices/clients/registration'
import {
  createEnrollmentClient,
  generateEnrollmentPassword,
} from '../../apps/mdm/src/features/devices/clients/enrollment'
const fixture = JSON.parse(readFileSync(process.env['MDM_REGISTRATION_FIXTURE']!, 'utf8')) as {
  origin: string
  tenant: string
  admin: { cookie: string; csrf: string }
  user: { cookie: string; csrf: string }
}
if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/.test(fixture.origin))
  throw new Error('Expected an isolated loopback fixture')
function transport(actor: typeof fixture.admin): HttpTransport {
  return {
    async request<T>(o: RequestOptions<T>) {
      const path = o.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
        encodeURIComponent(o.pathParams?.[key] ?? ''),
      )
      // Node fetch removes Host overrides. The isolated listener still enforces
      // the configured tenant host, so use an explicit Node HTTP request.
      const response = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
        const outgoing = request(
          fixture.origin + path,
          {
            method: o.method,
            headers: {
              host: 'mdm.example.test',
              cookie: actor.cookie,
              origin: 'https://mdm.example.test',
              'x-identity-request': '1',
              'x-csrf-token': actor.csrf,
              'content-type': 'application/json',
              ...o.headers,
            },
            signal: AbortSignal.timeout(12000),
          },
          (incoming) => {
            let body = ''
            incoming.setEncoding('utf8')
            incoming.on('data', (chunk: string) => (body += chunk))
            incoming.on('error', reject)
            incoming.on('end', () => {
              try {
                resolve({ status: incoming.statusCode ?? 0, body: JSON.parse(body) as unknown })
              } catch (error) {
                reject(error)
              }
            })
          },
        )
        outgoing.on('error', reject)
        outgoing.end(o.body === undefined ? undefined : JSON.stringify(o.body))
      })
      if (response.status !== o.successStatus) throw decodeMdmError(response.status, response.body)
      return o.decode(response.body)
    },
  } as HttpTransport
}
it('real server receipts preserve browser quota, self enrollment, inheritance and optional organization responsibility', async () => {
  const adminTransport = transport(fixture.admin),
    userTransport = transport(fixture.user)
  const admin = createRegistrationClient(adminTransport, fixture.tenant),
    user = createRegistrationClient(userTransport, fixture.tenant)
  const usage = await user.me(),
    target = {
      tenantId: usage.tenantId,
      instanceId: usage.instanceId,
      principalId: usage.principalId,
    }
  expect(usage.channels.map((c) => c.limit)).toEqual([20, 20, 20])
  await expect(user.configuration()).rejects.toMatchObject({ status: 403 })
  const limits = { agent: null, windows_mdm: 1, macos_mdm: null }
  await admin.change(crypto.randomUUID(), 0, limits, target)
  const operation = crypto.randomUUID(),
    password = generateEnrollmentPassword()
  const pending = await user.enroll(operation, password, 'mdm.windows', 'Device')
  expect(await user.enroll(operation, password, 'mdm.windows', 'Device')).toEqual(pending)
  expect((await user.me()).channels.find((c) => c.channel === 'windows_mdm')).toMatchObject({
    active: 0,
    reserved: 1,
    used: 1,
    canEnroll: false,
  })
  await expect(
    user.enroll(crypto.randomUUID(), generateEnrollmentPassword(), 'mdm.windows', 'Device'),
  ).rejects.toMatchObject({ status: 429, code: 'registration_limit' })
  const orgId = 'browser-joint-org-' + crypto.randomUUID()
  const organization = createEnrollmentClient(adminTransport)
  await organization.create(crypto.randomUUID(), {
    deviceId: orgId,
    password: generateEnrollmentPassword(),
    source: 'mdm.windows',
    windowsProfile: 'Device',
  })
  expect((await admin.responsibility(orgId)).user).toBeNull()
  await admin.assign(orgId, crypto.randomUUID(), 0, target)
  expect((await user.me()).channels.find((c) => c.channel === 'windows_mdm')?.used).toBe(1)
  await admin.assign(orgId, crypto.randomUUID(), 1, null)
  expect((await admin.responsibility(orgId)).user).toBeNull()
  const enrollments = createEnrollmentClient(userTransport)
  expect((await enrollments.status(pending.enrollmentId)).status).toBe('pending')
  await enrollments.cancel(pending.enrollmentId, crypto.randomUUID())
  expect((await user.me()).channels.find((c) => c.channel === 'windows_mdm')?.used).toBe(0)
  await admin.change(
    crypto.randomUUID(),
    1,
    { agent: null, windows_mdm: null, macos_mdm: null },
    target,
  )
  expect((await user.me()).channels.map((c) => c.limit)).toEqual([20, 20, 20])
})
