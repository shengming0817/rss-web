import {
  directoryPage,
  computerRecord,
  bindingRecord,
  materialRecord,
  applicationRecord,
} from './directory'
import { randomUUID } from 'node:crypto'
import { viewDecoders as d } from '@rss/device-access/model'
import type { Application, Configuration, OriginalOperation } from '@rss/device-access/model'
import { seed, TENANT, PRINCIPAL, scenarios, type Scenario } from './state'
interface Reply {
  status: number
  body?: unknown
  headers?: Record<string, string>
}
interface Session {
  id: string
  principal: string
  csrf: string
  reader: boolean
  proof: boolean
}
export function createDemoServer() {
  const data = seed(),
    sessions = new Map<string, Session>()
  let scenario: Scenario = 'normal'
  const fail = (status: number, code: string): Reply => ({ status, body: { code } })
  const ok = (body: unknown): Reply => ({ status: 200, body })
  function sessionBody(s: Session) {
    const now = Math.floor(Date.now() / 1000)
    return {
      session: {
        id: s.id,
        issuedAt: now,
        idleExpiresAt: now + 3600,
        absoluteExpiresAt: now + 7200,
      },
      identity: { principalId: s.principal, hasLocalPassword: true },
      csrfToken: s.csrf,
    }
  }
  return {
    data,
    handle(
      method: string,
      url: string,
      body: unknown,
      headers: Record<string, string | string[] | undefined>,
    ): Reply {
      const parsed = new URL(url, 'http://127.0.0.1'),
        path = parsed.pathname
      const cookie = String(headers['cookie'] ?? '')
        .split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith('rss-da-demo='))
        ?.slice(12)
      const session = cookie ? sessions.get(cookie) : undefined
      const identity = '/api/v1/identity/tenants/' + TENANT
      if (path === identity + '/login' && method === 'POST') {
        const v = d.closed(body, ['login', 'password'])
        if (!['demo', 'reader'].includes(String(v['login'])) || v['password'] !== 'demo')
          return fail(401, 'invalid_credential')
        const s: Session = {
          id: randomUUID(),
          principal: PRINCIPAL,
          csrf: randomUUID().replaceAll('-', '').repeat(2),
          reader: v['login'] === 'reader',
          proof: false,
        }
        scenario = 'normal'
        sessions.set(s.id, s)
        return {
          ...ok(sessionBody(s)),
          headers: { 'Set-Cookie': 'rss-da-demo=' + s.id + '; Path=/; HttpOnly; SameSite=Strict' },
        }
      }
      if (!session)
        return fail(401, path.includes('/identity/') ? 'invalid_credential' : 'invalid_identity')
      if (scenario === 'expired' && path !== '/api/da-demo/scenario') {
        sessions.delete(session.id)
        return fail(401, 'invalid_credential')
      }
      if (
        method !== 'GET' &&
        (headers['x-csrf-token'] !== session.csrf || headers['x-identity-request'] !== '1')
      )
        return fail(403, 'csrf_rejected')
      if (path === identity + '/session' && method === 'GET') return ok(sessionBody(session))
      if (path === '/api/v1/identity-host/tenants/' + TENANT + '/context' && method === 'GET')
        return ok({
          tenantId: TENANT,
          principalId: session.principal,
          sessionId: session.id,
          navigation: { manageAccounts: false, manageProviders: false },
        })
      if (path === identity + '/session/refresh' && method === 'POST') {
        session.csrf = randomUUID().replaceAll('-', '').repeat(2)
        return ok(sessionBody(session))
      }
      if (path === identity + '/session/logout' && method === 'POST') {
        sessions.delete(session.id)
        return {
          status: 204,
          headers: { 'Set-Cookie': 'rss-da-demo=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' },
        }
      }
      if (!path.startsWith('/api/da-demo/')) return fail(501, 'action_not_supported')
      if (path === '/api/da-demo/scenario') {
        if (method === 'GET') return ok({ scenario })
        const v = d.closed(body, ['scenario'])
        scenario = d.choice(v['scenario'], scenarios)
        return ok({ scenario })
      }
      if (scenario === 'forbidden') return fail(403, 'permission_denied')
      if (scenario === 'unavailable') return fail(503, 'service_unavailable')
      const route = path
        .slice('/api/da-demo'.length)
        .split('/')
        .filter(Boolean)
        .map(decodeURIComponent)
      const paginate = (items: unknown[]) => {
        const cursor = parsed.searchParams.get('cursor')
        const offset = cursor === null ? 0 : Number(cursor)
        if (!Number.isSafeInteger(offset) || offset < 0) return fail(400, 'malformed_request')
        const filtered = scenario === 'empty' ? [] : items
        const next = offset + 20
        return ok({
          items: filtered.slice(offset, next),
          nextCursor: next < filtered.length ? String(next) : null,
        })
      }
      const directory = (items: Record<string, unknown>[]) => {
        try {
          return ok(
            directoryPage(
              scenario === 'empty' ? [] : items,
              parsed.searchParams,
              session.id + ':' + path,
            ),
          )
        } catch {
          return fail(400, 'malformed_request')
        }
      }
      const denyWrite = () =>
        session.reader || scenario === 'readonly'
          ? fail(403, 'permission_denied')
          : scenario === 'conflict'
            ? fail(409, 'operation_conflict')
            : null
      if (method === 'POST' && !['prove', 'cancel'].includes(route[0] ?? '')) {
        const denied = denyWrite()
        if (denied) return denied
        if (scenario === 'stepup' && !session.proof && route.at(-1) !== 'challenge')
          return fail(403, 'reauthentication_required')
      }
      if (route[0] === 'prove') {
        session.proof = true
        return ok({ proved: true })
      }
      if (route[0] === 'cancel') return ok({ cancelled: true })
      if (route.at(-1) === 'challenge')
        return ok({ id: randomUUID(), options: {}, expiresAt: Math.floor(Date.now() / 1000) + 120 })
      function mutate(
        device: string | null,
        kind: string,
        value: Record<string, unknown>,
        apply: () => unknown,
      ): Reply {
        const id = d.uuid(value['operationId']),
          payload = JSON.stringify({ path, value }),
          old = data.operations.get(id)
        if (old) {
          if (old.principal !== session!.principal || old.payload !== payload)
            return fail(409, 'operation_conflict')
          return ok(old.result)
        }
        const result = apply(),
          operation: OriginalOperation = {
            id,
            device,
            kind,
            state: ['assignment', 'application', 'configuration'].includes(kind)
              ? 'completed'
              : 'accepted',
            observations: [],
          }
        data.operations.set(id, { principal: session!.principal, payload, result, operation })
        data.audit.unshift({
          id: randomUUID(),
          recordedAt: Math.floor(Date.now() / 1000),
          actor: '演示管理员',
          action: kind,
          device,
          outcome: 'accepted',
          phase: 'service',
        })
        if (scenario === 'unknown') return fail(503, 'operation_unknown')
        return ok(result)
      }
      if (method === 'POST' && body && typeof body === 'object' && !Array.isArray(body)) {
        const candidate = body as Record<string, unknown>
        if (typeof candidate['operationId'] === 'string') {
          const old = data.operations.get(candidate['operationId'])
          if (old)
            return old.principal === session.principal &&
              old.payload === JSON.stringify({ path, value: candidate })
              ? ok(old.result)
              : fail(409, 'operation_conflict')
        }
      }
      if (route[0] === 'operations' && method === 'GET') {
        const entry = data.operations.get(route[1] ?? '')
        const device = parsed.searchParams.get('device')
        return ok(
          entry && entry.principal === session.principal && entry.operation.device === device
            ? entry.operation
            : null,
        )
      }
      if (route[0] === 'people' && method === 'GET') return ok(data.people)
      if (route[0] === 'scopes' && method === 'GET') return ok(data.scopes)
      if (route[0] === 'audit' && method === 'GET') return paginate(data.audit)
      if (route[0] === 'computers') {
        if (route.length === 1 && method === 'GET')
          return directory(data.computers.map(computerRecord))
        const computer = data.computers.find((c) => c.id === route[1])
        if (!computer) return fail(404, 'management_device_not_found')
        const id = computer.id
        if (route.length === 2 && method === 'GET')
          return ok({
            ...computer,
            ...(scenario === 'offline'
              ? { lastObservedAt: Math.floor(Date.now() / 1000) - 172800 }
              : {}),
          })
        if (route[2] === 'assignment') {
          const current = data.assignments[id]!
          if (method === 'GET') return ok(current)
          const v = d.closed(body, ['operationId', 'expectedRevision', 'assignee', 'owner'])
          if (d.count(v['expectedRevision']) !== current.revision)
            return fail(409, 'operation_conflict')
          const assignee = d.nullable(v['assignee'], d.person),
            owner = d.nullable(v['owner'], d.person)
          if (
            [assignee, owner].some(
              (p) => p && p.id !== 'organization' && !data.people.some((x) => x.id === p.id),
            )
          )
            return fail(400, 'malformed_request')
          return mutate(
            id,
            'assignment',
            v,
            () =>
              (data.assignments[id] = {
                device: id,
                revision: current.revision + 1,
                assignee,
                owner,
              }),
          )
        }
        if (route[2] === 'passkeys' && method === 'GET') return paginate(data.passkeys[id] ?? [])
        if (route[2] === 'audit' && method === 'GET')
          return paginate(data.audit.filter((a) => a.device === id))
        if (route[2] === 'bindings') {
          const bindings = data.bindings[id]!
          if (method === 'GET') {
            if (route[3]) {
              const entry = bindings.find((v) => v.id === route[3])
              return entry ? ok(entry) : fail(404, 'inventory_not_found')
            }
            return directory(bindings.map((v) => bindingRecord(v, computer)))
          }
          const v = d.closed(body, ['operationId', 'expectedRevision', 'action']),
            entry = bindings.find((b) => b.id === route[3])
          if (!entry) return fail(404, 'inventory_not_found')
          if (entry.revision !== v['expectedRevision']) return fail(409, 'operation_conflict')
          const action = d.closed(v['action'], ['kind'])
          d.same(action['kind'], 'reset_factors')
          return mutate(id, 'binding', v, () => {
            entry.revision++
            entry.factorGeneration++
            entry.targetRevision = entry.revision
            entry.serverState = 'pending'
            return { ...entry }
          })
        }
        if (route[2] === 'binding-operations' && method === 'GET') {
          const op = data.operations.get(route[3] ?? '')
          return op && op.principal === session.principal && op.operation.device === id
            ? ok(op.result)
            : fail(404, 'operation_not_found')
        }
        if (route[2] === 'materials') {
          const materials = data.materials[id] ?? []
          if (route.length === 3 && method === 'GET')
            return directory(materials.map(materialRecord))
          const entry = materials.find((m) => m.id === route[3])
          if (!entry) return fail(404, 'recovery_credential_not_found')
          if (method === 'GET')
            return entry.version === Number(parsed.searchParams.get('version'))
              ? ok(entry)
              : fail(404, 'inventory_not_found')
          const v = d.closed(body, ['operationId', 'version'])
          d.uuid(v['operationId'])
          if (entry.version !== v['version']) return fail(409, 'operation_conflict')
          if (route[4] === 'secret') {
            if (session.reader) return fail(403, 'permission_denied')
            return ok({ secret: 'DEMO · 非真实恢复材料 · 4826 1093' })
          }
          if (route[4] === 'rotate')
            return mutate(id, 'rotation', v, () => ({
              id: v['operationId'],
              device: id,
              kind: 'rotation',
              state: 'accepted',
              observations: [{ key: 'deviceEffect', state: 'unknown', value: null }],
            }))
        }
      }
      if (route[0] === 'configurations') {
        if (method === 'GET') {
          if (route[1]) {
            const entry = data.configurations.find((v) => v.id === route[1])
            return entry ? ok(entry) : fail(404, 'inventory_not_found')
          }
          return paginate(data.configurations)
        }
        const v = d.closed(body, [
          'id',
          'name',
          'platform',
          'role',
          'selfEnrollment',
          'scope',
          'exclusions',
          'mode',
          'operationId',
          'expectedRevision',
        ])
        const id = d.uuid(v['id']),
          current = data.configurations.find((c) => c.id === id)
        if ((current?.revision ?? 0) !== d.count(v['expectedRevision']))
          return fail(409, 'operation_conflict')
        const next = d.configurationView({
          id,
          name: v['name'],
          platform: v['platform'],
          role: v['role'],
          selfEnrollment: v['selfEnrollment'],
          scope: v['scope'],
          exclusions: v['exclusions'],
          mode: v['mode'],
          revision: (current?.revision ?? 0) + 1,
          state: 'pending',
        })
        if (
          !data.scopes.some((s) => s.id === next.scope.id) ||
          next.exclusions.some((e) => !data.computers.some((c) => c.id === e.id))
        )
          return fail(400, 'malformed_request')
        return mutate(null, 'configuration', v, () => {
          const index = data.configurations.findIndex((c) => c.id === id)
          if (index < 0) data.configurations.push(next)
          else data.configurations[index] = next
          return next as Configuration
        })
      }
      if (route[0] === 'applications') {
        if (method === 'GET') {
          if (route[1]) {
            const entry = data.applications.find((v) => 'rp:' + v.id === route[1])
            return entry ? ok(entry) : fail(404, 'inventory_not_found')
          }
          return directory(data.applications.map(applicationRecord))
        }
        const v = d.closed(body, [
            'id',
            'enabled',
            'callback',
            'capabilities',
            'operationId',
            'expectedRevision',
          ]),
          id = d.text(v['id'], 64),
          current = data.applications.find((a) => a.id === id)
        if ((current?.revision ?? 0) !== d.count(v['expectedRevision']))
          return fail(409, 'operation_conflict')
        const next = d.applicationView({
          id,
          revision: (current?.revision ?? 0) + 1,
          enabled: v['enabled'],
          callback: v['callback'],
          capabilities: v['capabilities'],
        })
        const url = new URL(next.callback)
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
          return fail(400, 'malformed_request')
        return mutate(null, 'application', v, () => {
          const index = data.applications.findIndex((a) => a.id === id)
          if (index < 0) data.applications.push(next)
          else data.applications[index] = next
          return next as Application
        })
      }
      if (route[0] === 'credentials') {
        if (method === 'GET') return ok(data.credentials)
        if (route[2] === 'remove') {
          const i = data.credentials.findIndex((c) => c.id === route[1])
          if (i < 0) return fail(404, 'inventory_not_found')
          data.credentials.splice(i, 1)
          return ok({ removed: true })
        }
        const v = d.closed(body, ['label']),
          credential = { id: randomUUID(), label: d.text(v['label'], 128) }
        data.credentials.push(credential)
        return ok(credential)
      }
      return fail(501, 'action_not_supported')
    },
  }
}
