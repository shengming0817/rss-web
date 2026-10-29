import { expect, it } from 'vitest'
import { createLifecycleDemo } from './lifecycle'
import { operation, request, softwareResource } from './fixtures'
it('registers enabled sources, keeps drafts absent, and invalidates frozen bindings across withdrawal and re-enable', () => {
  const { resources } = softwareResource(),
    demo = createLifecycleDemo(resources),
    source = '/api/v1/software/sources/private/revisions/1',
    version = '/api/v1/software/resources/app/versions/1'
  expect(demo.handle(request(version), 'normal')?.body).toMatchObject({ lifecycle: null })
  const registered = demo.handle(
    request(
      source,
      operation(
        {
          action: 'register',
          definition: { id: 'private', revision: '1', protocol: { kind: 'private' } },
        },
        0,
      ),
    ),
    'normal',
  )!
  expect(registered.body).toMatchObject({ lifecycle: { state: 'enabled', revision: 1 } })
  expect(demo.handle(request(version, operation({ action: 'enable' }, 0)), 'normal')?.status).toBe(
    200,
  )
  expect(demo.isEnabled('app', '1')).toBe(true)
  const original = demo.binding('app', '1')
  expect(
    demo.handle(request(version, operation({ action: 'withdraw' }, 1)), 'normal')?.status,
  ).toBe(200)
  expect(demo.isEnabled('app', '1')).toBe(false)
  expect(demo.handle(request(version, operation({ action: 'enable' }, 2)), 'normal')?.status).toBe(
    200,
  )
  expect(demo.binding('app', '1')).not.toBe(original)
  expect(demo.handle(request(source, operation({ action: 'disable' }, 1)), 'normal')?.status).toBe(
    200,
  )
  expect(demo.isEnabled('app', '1')).toBe(false)
  expect(
    demo.handle(request(source, operation({ action: 'approve', evidence: ['old'] }, 2)), 'normal')
      ?.status,
  ).toBe(400)
})
