import { createServer, request as httpRequest } from 'node:http'
import { once } from 'node:events'
import { expect, onTestFinished } from 'vitest'
import { decodeMdmError, type HttpTransport, type RequestOptions } from '@rss/api/mdm'
import { createScenario, TENANT } from '../scenario'
import { createSoftwareAssetsDemo } from './state'
import { createSoftwareAssetsDemoClient } from './client'
/** Actual loopback HTTP through the existing demo session/scenario owner; no backend fixture. */
export async function softwareAssetsHttp() {
  const domain = createSoftwareAssetsDemo(),
    scenario = createScenario([domain.handle], domain.reset)
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array))
      const raw = Buffer.concat(chunks).toString(),
        reply = await scenario.handle(
          req.method ?? 'GET',
          req.url ?? '/',
          raw ? JSON.parse(raw) : undefined,
          req.headers,
        )
      res.writeHead(reply.status, { 'Content-Type': 'application/json' })
      res.end(reply.body === undefined ? undefined : JSON.stringify(reply.body))
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 'malformed_request' }))
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  onTestFinished(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  )
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No loopback address')
  const origin = `http://127.0.0.1:${address.port}`
  let headers: Record<string, string> = {}
  async function http(method: string, path: string, body?: unknown) {
    return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const request = httpRequest(
        `${origin}${path}`,
        { method, headers: { 'Content-Type': 'application/json', ...headers } },
        (response) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk as Uint8Array)))
          response.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString()
              resolve({
                status: response.statusCode ?? 500,
                body: raw ? JSON.parse(raw) : undefined,
              })
            } catch (error) {
              reject(error)
            }
          })
          response.on('error', reject)
        },
      )
      request.setTimeout(10_000, () => request.destroy(new Error('Mock HTTP request timed out')))
      request.on('error', reject)
      if (body !== undefined) request.write(JSON.stringify(body))
      request.end()
    })
  }
  async function login(name = 'demo') {
    const reply = await http('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
      login: name,
      password: 'demo',
    })
    expect(reply.status).toBe(200)
    headers = {
      'x-csrf-token': (reply.body as { csrfToken: string }).csrfToken,
      'x-identity-request': '1',
    }
  }
  const transport = {
    async request<T>(o: RequestOptions<T>) {
      const path = o.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
        encodeURIComponent(o.pathParams?.[key] ?? ''),
      )
      const query = new URLSearchParams(
        Object.entries(o.query ?? {})
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      )
      const reply = await http(o.method, `${path}?${query}`, o.body)
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
  const client = createSoftwareAssetsDemoClient(transport)
  await login()
  return { client, transport, scenario, domain, login, http }
}
