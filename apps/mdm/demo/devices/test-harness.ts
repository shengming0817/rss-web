import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createScenario, TENANT } from '../scenario'
import { createDeviceDemo } from './state'
import { createAssetsClient } from '../../src/features/devices/clients/assets'
import { createDirectoryClient } from '../../src/features/devices/clients/directory'
import { createAssociationsClient } from '../../src/features/devices/clients/associations'
import { createDeviceViewsClient } from '../../src/features/devices/clients/device-views'
import { createGroupsClient } from '../../src/features/devices/clients/groups'
import { createEnrollmentClient } from '../../src/features/devices/clients/enrollment'
export async function setup() {
  const domain = createDeviceDemo(),
    scenario = createScenario([domain.handle], domain.reset)
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  const transport = {
    async request<T>(o: RequestOptions<T>) {
      const path = o.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
        encodeURIComponent(o.pathParams?.[key] ?? ''),
      )
      const query = new URLSearchParams(
        Object.entries(o.query ?? {})
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )
      const reply = await scenario.handle(o.method, `${path}?${query}`, o.body, {
        ...headers,
        ...Object.fromEntries(
          Object.entries(o.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
        ),
      })
      if (reply.status !== o.successStatus)
        throw Object.assign(new Error('Request rejected'), {
          status: reply.status,
          body: reply.body,
        })
      return o.decode(reply.body)
    },
  } as unknown as HttpTransport
  return {
    associations: createAssociationsClient(transport),
    views: createDeviceViewsClient(transport, TENANT),
    domain,
    transport,
    scenario,
    headers,
    assets: createAssetsClient(transport, TENANT),
    directory: createDirectoryClient(transport),
    groups: createGroupsClient(transport),
    enrollment: createEnrollmentClient(transport),
  }
}

/** Follow the public definition task, then discover its independently published membership. */
export async function publishGroupDefinition(
  groups: ReturnType<typeof createGroupsClient>,
  id: string,
  task: string,
) {
  await groups.status(id, task, 'group_definition')
  const definition = await groups.status(id, task, 'group_definition')
  if (definition.status !== 'completed') throw new Error('Definition did not complete')
  await groups.read(id)
  const read = await groups.read(id)
  if (!read.memberSet || read.freshness !== 'current') throw new Error('Membership did not publish')
  return read.memberSet
}
