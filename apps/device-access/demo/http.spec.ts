// @vitest-environment node
import { it, expect } from 'vitest'
import { createServer } from 'vite'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { demoPlugin } from './plugin'
import { TENANT } from './state'
it('uses an actual bounded loopback HTTP session and refuses cross-origin requests', async () => {
  const server = await createServer({
    configFile: false,
    plugins: [demoPlugin()],
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  })
  try {
    await server.listen()
    const port = (server.httpServer!.address() as AddressInfo).port
    const call = (
      path: string,
      method = 'GET',
      body?: unknown,
      headers: Record<string, string> = {},
    ) =>
      new Promise<{ status: number; headers: Record<string, unknown>; body: unknown }>(
        (resolve, reject) => {
          const req = request(
            {
              host: '127.0.0.1',
              port,
              path,
              method,
              headers: { 'Content-Type': 'application/json', ...headers },
            },
            (res) => {
              let text = ''
              res.on('data', (b) => {
                text += String(b)
              })
              res.on('end', () =>
                resolve({
                  status: res.statusCode!,
                  headers: res.headers,
                  body: text ? JSON.parse(text) : null,
                }),
              )
            },
          )
          req.setTimeout(3000, () => req.destroy(new Error('timeout')))
          req.on('error', reject)
          req.end(body === undefined ? undefined : JSON.stringify(body))
        },
      )
    expect((await call('/api/da-demo/computers')).status).toBe(401)
    const login = await call(
      '/api/v1/identity/tenants/' + TENANT + '/login',
      'POST',
      { login: 'demo', password: 'demo' },
      { 'X-Identity-Request': '1' },
    )
    expect(login.status).toBe(200)
    const cookie = (login.headers['set-cookie'] as string[])[0]!.split(';')[0]!,
      csrf = (login.body as { csrfToken: string }).csrfToken
    expect(
      (await call('/api/da-demo/computers', 'GET', undefined, { Cookie: cookie })).body,
    ).toHaveProperty('items')
    expect(
      (
        await call(
          '/api/da-demo/scenario',
          'POST',
          { scenario: 'normal' },
          {
            Cookie: cookie,
            Origin: 'http://evil.test',
            'X-CSRF-Token': csrf,
            'X-Identity-Request': '1',
          },
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await call(
          '/api/da-demo/scenario',
          'POST',
          { scenario: 'normal' },
          { Cookie: cookie, 'X-CSRF-Token': csrf, 'X-Identity-Request': '1' },
        )
      ).status,
    ).toBe(200)
  } finally {
    await server.close()
  }
}, 15000)
