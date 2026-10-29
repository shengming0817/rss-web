import { decodeMdmError, type HttpTransport, type RequestOptions } from '@rss/api/mdm'
import { createScenario, TENANT } from '../../scenario'
import { createDemoGroups } from './state'
import { createDemoGroupsClient } from './client'
export async function setupGroups(loginName: 'demo' | 'reviewer' = 'demo') {
  const domain = createDemoGroups(),
    scenario = createScenario([domain.handle], domain.reset),
    requests: RequestOptions<unknown>[] = []
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: loginName,
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  const transport = {
    async request<T>(o: RequestOptions<T>) {
      requests.push({ ...o } as RequestOptions<unknown>)
      const path = o.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
          encodeURIComponent(o.pathParams?.[key] ?? ''),
        ),
        query = new URLSearchParams(
          Object.entries(o.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)]),
        )
      const reply = await scenario.handle(o.method, `${path}?${query}`, o.body, headers)
      if (
        !(
          (Array.isArray(o.successStatus)
            ? o.successStatus
            : [o.successStatus]) as readonly number[]
        ).includes(reply.status)
      )
        throw decodeMdmError(reply.status, reply.body)
      return o.decode(reply.body)
    },
  } as HttpTransport
  const client = createDemoGroupsClient(transport, TENANT)
  async function settle(taskId: string | null) {
    if (!taskId) throw new Error('Missing mock task')
    await client.task(taskId)
    const task = await client.task(taskId)
    if (task.status !== 'completed' || !task.resultId) throw new Error('Mock task not completed')
    return task
  }
  return {
    domain,
    scenario,
    transport,
    client,
    requests,
    settle,
    control: (scenarioName: string) =>
      scenario.handle(
        'POST',
        '/api/v1/mdm-candidate/workspace/scenario',
        { scenario: scenarioName },
        headers,
      ),
  }
}
