import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createServer, request as httpRequest } from 'node:http'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import assert from 'node:assert/strict'
import process from 'node:process'

const directory = dirname(fileURLToPath(import.meta.url))
const root = resolve(directory, '../..')
const composeFile = resolve(directory, 'compose.yml')
const project = `rss-web-edge-${process.pid}`
const tenant = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

function docker(args, options = {}) {
  return spawnSync('docker', ['compose', '-p', project, '-f', composeFile, ...args], {
    cwd: root,
    encoding: 'utf8',
    ...options,
  })
}

async function freePort() {
  const server = createServer()
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  assert(address && typeof address === 'object')
  const port = address.port
  await new Promise((resolveClose) => server.close(resolveClose))
  return port
}

function request(port, path, { method = 'GET', headers, body } = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest(
      { hostname: '127.0.0.1', port, path, method, headers },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json = null
          try {
            json = JSON.parse(text)
          } catch {
            // Non-JSON nginx errors and the SPA are expected in several assertions.
          }
          resolveRequest({ status: response.statusCode, headers: response.headers, text, json })
        })
      },
    )
    request.on('error', rejectRequest)
    if (body !== undefined) request.write(body)
    request.end()
  })
}

function expectFailure(args, env) {
  const result = docker(['run', '--rm', '--no-deps', ...args, 'edge', 'nginx', '-t'], {
    env: { ...process.env, RSS_EDGE_TEST_PORT: '1', ...env },
  })
  assert.notEqual(result.status, 0, `expected edge startup rejection for ${JSON.stringify(env)}`)
}

function assertGatewayUnavailable(status) {
  assert([502, 504].includes(status), `expected gateway outage, received ${String(status)}`)
}

const port = await freePort()
const environment = { ...process.env, RSS_EDGE_TEST_PORT: String(port) }

try {
  let result = docker(['build', 'edge'], { env: environment, stdio: 'inherit' })
  assert.equal(result.status, 0, 'edge image build failed')

  expectFailure(['-e', 'RSS_WEB_TENANT_ID='], {})
  expectFailure(['-e', 'RSS_WEB_TENANT_ID=F47AC10B-58CC-4372-A567-0E02B2C3D479'], {})
  expectFailure(['-e', 'RSS_WEB_TENANT_ID=00000000-0000-0000-0000-000000000000'], {})
  expectFailure(['-e', 'RSS_WEB_PRIMARY_PORT=0'], {})
  expectFailure(['-e', `RSS_WEB_TENANT_ID=${tenant}\n"; include /tmp/evil; #`], {})
  expectFailure(['-e', 'RSS_WEB_PRIMARY_HOST=primary\nadmin'], {})

  result = docker(['up', '-d', '--wait', '--wait-timeout', '120'], {
    env: environment,
    stdio: 'inherit',
  })
  assert.equal(result.status, 0, 'edge fixture startup failed')

  assert.equal((await request(port, '/')).status, 200)

  for (const path of ['/api/v1/identity/profile', '/api/v1/settings/configs/key']) {
    const response = await request(port, path, {
      headers: { 'X-Tenant-ID': 'attacker', Authorization: 'Bearer fixture' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.json.listener, 'primary')
    assert.deepEqual(response.json.tenantHeaders, [])
    assert.equal(response.json.authorizationPresent, true)
  }

  for (const path of ['/api/v1/audit/entries', '/api/v1/runtime/inventory']) {
    const response = await request(port, path, { headers: { 'X-Tenant-ID': 'attacker' } })
    assert.equal(response.status, 200)
    assert.equal(response.json.listener, 'admin')
    assert.deepEqual(response.json.tenantHeaders, [])
  }

  const targetAudit = await request(
    port,
    '/api/v1/audit/tenants/f47ac10b-58cc-4372-a567-0e02b2c3d479/entries?cursor=opaque',
    { headers: { 'X-Tenant-ID': 'attacker', Authorization: 'Bearer fixture' } },
  )
  assert.equal(targetAudit.status, 200)
  assert.equal(targetAudit.json.listener, 'admin')
  assert.deepEqual(targetAudit.json.tenantHeaders, [])
  assert.equal(targetAudit.json.authorizationPresent, true)

  for (const path of ['/api/v1/identity/login', '/api/v1/identity/refresh']) {
    for (const headers of [
      undefined,
      { 'X-Tenant-ID': 'attacker' },
      [
        'X-Tenant-ID',
        'attacker-one',
        'X-Tenant-ID',
        'attacker-two',
        'X-Forwarded-For',
        '203.0.113.9',
        'Forwarded',
        'for=203.0.113.9',
        'X-Original-URI',
        '/internal/secret',
        'X-Original-URL',
        '/health/v1/metrics',
        'X-Forwarded-Prefix',
        '/forged',
        'Host',
        'evil.example',
      ],
    ]) {
      const response = await request(port, path, { method: 'POST', headers })
      assert.equal(response.status, 200)
      assert.deepEqual(response.json.tenantHeaders, [tenant])
      assert.equal(response.json.forwarded, null)
      assert.equal(response.json.xOriginalUri, null)
      assert.equal(response.json.xOriginalUrl, null)
      assert.equal(response.json.xForwardedPrefix, null)
      assert(!String(response.json.xForwardedFor).includes('203.0.113.9'))
      assert.notEqual(response.json.host, 'evil.example')
    }
  }

  for (const path of [
    '/api/v1/identity/LOGIN',
    '/api/v1/identity/Login',
    '/api/v1/identity/login/',
    '/api/v1/identity/%6cogin',
  ]) {
    const response = await request(port, path, { method: 'POST', headers: { 'X-Tenant-ID': 'x' } })
    assert.equal(response.status, 200)
    assert.deepEqual(response.json.tenantHeaders, [])
  }

  const safeBody = JSON.stringify({ value: 'fixture' })
  const bodyResponse = await request(port, '/api/v1/settings/configs?cursor=next', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(safeBody)),
    },
    body: safeBody,
  })
  assert.equal(bodyResponse.json.url, '/api/v1/settings/configs?cursor=next')
  assert.equal(bodyResponse.json.bodyBytes, Buffer.byteLength(safeBody))
  assert.equal(bodyResponse.json.bodySha256, createHash('sha256').update(safeBody).digest('hex'))

  const errorResponse = await request(port, '/api/v1/audit/entries?fixture-status=418')
  assert.equal(errorResponse.status, 418)
  assert.equal(errorResponse.headers['x-fixture-listener'], 'admin')

  const primaryBefore = (await request(port, '/api/v1/identity/__fixture-count')).json.requestCount
  const adminBefore = (await request(port, '/api/v1/audit/entries?fixture-count=1')).json
    .requestCount
  for (const path of [
    '/internal/v1/secret',
    '/health/v1/healthz',
    '/health/v1/readyz',
    '/health/v1/metrics',
    '/metrics',
    '/metrics/',
    '/api',
    '/internal',
    '/health',
    '/api/v1/runtime/other',
    '/api/v1/audit/other',
    '/api/v1/audit/tenants/F47AC10B-58CC-4372-A567-0E02B2C3D479/entries',
    '/api/v1/audit/tenants/00000000-0000-0000-0000-000000000000/entries',
    '/api/v1/audit/tenants/f47ac10b-58cc-4372-a567-0e02b2c3d479/entries/',
    '/api/v1/audit/tenants/f47ac10b-58cc-4372-a567-0e02b2c3d479/entries/extra',
    '/api/v1/audit/tenants/not-a-tenant/entries',
    '/api/v1/audit/tenants/f47ac10b-58cc-4372-a567-0e02b2c3d479%2Fentries',
    '/api/v1/audit/tenants/%66%34%37%61%63%31%30%62-58cc-4372-a567-0e02b2c3d479/entries',
    '/api/v1/audit//tenants/f47ac10b-58cc-4372-a567-0e02b2c3d479/entries',
    '/api/v1/unknown',
  ]) {
    assert.equal((await request(port, path)).status, 404, path)
  }
  assert.equal(
    (await request(port, '/api/v1/identity/__fixture-count')).json.requestCount,
    primaryBefore,
  )
  assert.equal(
    (await request(port, '/api/v1/audit/entries?fixture-count=1')).json.requestCount,
    adminBefore,
  )

  result = docker(['stop', 'admin'], { env: environment })
  assert.equal(result.status, 0)
  assertGatewayUnavailable((await request(port, '/api/v1/runtime/inventory')).status)
  assert.equal((await request(port, '/api/v1/identity/profile')).status, 200)
  assert.equal((await request(port, '/')).status, 200)

  result = docker(['start', 'admin'], { env: environment })
  assert.equal(result.status, 0)
  result = docker(['stop', 'primary'], { env: environment })
  assert.equal(result.status, 0)
  assertGatewayUnavailable((await request(port, '/api/v1/identity/profile')).status)
  assert.equal((await request(port, '/api/v1/audit/entries')).status, 200)
} finally {
  docker(['down', '--volumes', '--remove-orphans'], { env: environment, stdio: 'inherit' })
}
