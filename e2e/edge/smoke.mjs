import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createServer, request as httpRequest } from 'node:http'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import assert from 'node:assert/strict'
import process from 'node:process'

const shellCache = 'no-store, max-age=0, must-revalidate'
const assetCache = 'public, max-age=31536000, immutable'

function assertSecurityHeaders(response) {
  const csp = response.headers['content-security-policy']
  assert.equal(typeof csp, 'string')
  assert(csp.includes("default-src 'none'"))
  assert(csp.includes("frame-ancestors 'none'"))
  assert(!csp.includes('unsafe-inline'))
  assert(!csp.includes('unsafe-eval'))
  assert.equal(response.headers['referrer-policy'], 'no-referrer')
  assert.equal(response.headers['x-content-type-options'], 'nosniff')
  assert.equal(response.headers['x-frame-options'], 'DENY')
  assert.equal(response.headers['strict-transport-security'], undefined)
}

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
  if (result.status !== 0) {
    docker(['logs', 'edge'], { env: environment, stdio: 'inherit' })
  }
  assert.equal(result.status, 0, 'edge fixture startup failed')

  const rootResponse = await request(port, '/')
  assert.equal(rootResponse.status, 200)
  assert.equal(rootResponse.headers['cache-control'], shellCache)
  assertSecurityHeaders(rootResponse)
  const inlineScripts = [...rootResponse.text.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  assert.equal(inlineScripts.length, 0)
  assert(!rootResponse.headers['content-security-policy'].match(/sha(?:256|384|512)-/))

  for (const path of ['/index.html', '/theme-init.js', '/settings/secret-material']) {
    const shell = await request(port, path)
    assert.equal(shell.status, 200)
    assert.equal(shell.headers['cache-control'], shellCache)
    assertSecurityHeaders(shell)
  }

  const imageContents = docker(
    [
      'exec',
      '-T',
      'edge',
      'sh',
      '-c',
      "find /usr/share/nginx/html -type f | sed 's#^/usr/share/nginx/html/##' | sort",
    ],
    { env: environment },
  )
  assert.equal(imageContents.status, 0)
  const staticFiles = imageContents.stdout.trim().split('\n')
  assert(staticFiles.includes('index.html'))
  assert(!staticFiles.includes('50x.html'))
  assert(!staticFiles.some((file) => file.endsWith('.map')))
  const assets = staticFiles.filter((file) => file.startsWith('assets/'))
  assert(assets.length > 0)
  assert(
    assets.every((file) => /^assets\/.+-[A-Za-z0-9_-]{8}\.(?:css|js)$/.test(file)),
    `runtime contains an unhashed asset: ${assets.join(', ')}`,
  )
  assert.deepEqual(
    staticFiles.filter((file) => !file.startsWith('assets/')),
    ['index.html', 'theme-init.js'],
  )

  const runtimeClosure = docker(
    [
      'exec',
      '-T',
      'edge',
      'sh',
      '-c',
      [
        'test -f /etc/nginx/templates/default.conf.template',
        'test -f /etc/nginx/snippets/rss-proxy-common.conf',
        'test -f /etc/nginx/snippets/rss-security-headers.conf',
        'test -x /docker-entrypoint.d/15-validate-edge-env.sh',
        'test ! -e /app',
        '! command -v node',
        '! command -v pnpm',
      ].join(' && '),
    ],
    { env: environment },
  )
  assert.equal(runtimeClosure.status, 0, `runtime closure check failed: ${runtimeClosure.stderr}`)

  for (const asset of assets) {
    const response = await request(port, `/${asset}`)
    assert.equal(response.status, 200)
    assert.equal(response.headers['cache-control'], assetCache)
    assert.equal(response.headers.expires, undefined)
    assertSecurityHeaders(response)
  }
  const missingAsset = await request(port, '/assets/not-hashed.js')
  assert.equal(missingAsset.status, 404)
  assert.equal(missingAsset.headers['cache-control'], undefined)
  assertSecurityHeaders(missingAsset)

  for (const path of ['/api/v1/identity/profile', '/api/v1/settings/configs/key']) {
    const response = await request(port, path, {
      headers: { 'X-Tenant-ID': 'attacker', Authorization: 'Bearer fixture' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.json.listener, 'primary')
    assert.deepEqual(response.json.tenantHeaders, [])
    assert.equal(response.json.authorizationPresent, true)
  }

  const passwordBody = JSON.stringify({
    currentPassword: 'fixture-current',
    newPassword: 'fixture-replacement',
  })
  const passwordChange = await request(port, '/api/v1/identity/password/change', {
    method: 'POST',
    headers: {
      'X-Tenant-ID': 'attacker',
      Authorization: 'Bearer fixture',
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(passwordBody)),
    },
    body: passwordBody,
  })
  assert.equal(passwordChange.status, 200)
  assert.equal(passwordChange.json.listener, 'primary')
  assert.deepEqual(passwordChange.json.tenantHeaders, [])
  assert.equal(passwordChange.json.authorizationPresent, true)
  assert.equal(
    passwordChange.json.bodySha256,
    createHash('sha256').update(passwordBody).digest('hex'),
  )

  const accountUserId = '11111111-1111-4111-8111-111111111111'
  const accountPath = `/api/v1/identity/accounts/${accountUserId}/status`
  const accountStatus = await request(port, accountPath, {
    headers: { 'X-Tenant-ID': 'attacker', Authorization: 'Bearer fixture' },
  })
  assert.equal(accountStatus.status, 200)
  assert.equal(accountStatus.json.listener, 'primary')
  assert.equal(accountStatus.json.method, 'GET')
  assert.equal(accountStatus.json.url, accountPath)
  assert.deepEqual(accountStatus.json.tenantHeaders, [])
  assert.equal(accountStatus.json.authorizationPresent, true)

  const accountBody = JSON.stringify({ targetStatus: 'suspended' })
  const accountStatusSet = await request(port, accountPath, {
    method: 'PUT',
    headers: {
      'X-Tenant-ID': 'attacker',
      Authorization: 'Bearer fixture',
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(accountBody)),
    },
    body: accountBody,
  })
  assert.equal(accountStatusSet.status, 200)
  assert.equal(accountStatusSet.json.listener, 'primary')
  assert.equal(accountStatusSet.json.method, 'PUT')
  assert.equal(accountStatusSet.json.url, accountPath)
  assert.deepEqual(accountStatusSet.json.tenantHeaders, [])
  assert.equal(accountStatusSet.json.authorizationPresent, true)
  assert.equal(
    accountStatusSet.json.bodySha256,
    createHash('sha256').update(accountBody).digest('hex'),
  )

  const rolesList = await request(port, '/api/v1/identity/roles?limit=50', {
    headers: { 'X-Tenant-ID': 'attacker', Authorization: 'Bearer fixture' },
  })
  assert.equal(rolesList.status, 200)
  assert.equal(rolesList.json.listener, 'primary')
  assert.equal(rolesList.json.method, 'GET')
  assert.deepEqual(rolesList.json.tenantHeaders, [])
  assert.equal(rolesList.json.authorizationPresent, true)

  const configBody = JSON.stringify({ key: 'app.k', value: 'edge-sensitive-fixture' })
  const rollbackBody = JSON.stringify({ toVersion: 1 })
  const secretCoordinateMarkers = [
    'edge-secret-key-marker',
    'edge-secret-store-marker',
    'edge-secret-ref-marker',
    'edge-secret-version-marker',
  ]
  const secretMaterialKeyMarker = 'edge-secret-material-key-marker'
  const secretPublishBody = JSON.stringify({
    key: secretCoordinateMarkers[0],
    storeId: secretCoordinateMarkers[1],
    refKey: secretCoordinateMarkers[2],
    refVersion: secretCoordinateMarkers[3],
  })
  for (const [method, path, body] of [
    ['GET', '/api/v1/settings/configs/app.k', undefined],
    ['POST', '/api/v1/settings/configs', configBody],
    ['DELETE', '/api/v1/settings/configs/app.k', undefined],
    ['POST', '/api/v1/settings/configs/app.k/rollbacks', rollbackBody],
    ['POST', '/api/v1/settings/secrets', secretPublishBody],
  ]) {
    const response = await request(port, path, {
      method,
      headers: {
        'X-Tenant-ID': 'attacker',
        Authorization: 'Bearer fixture',
        ...(body === undefined
          ? {}
          : {
              'Content-Type': 'application/json',
              'Content-Length': String(Buffer.byteLength(body)),
            }),
      },
      ...(body === undefined ? {} : { body }),
    })
    assert.equal(response.status, 200)
    assert.equal(response.json.listener, 'primary')
    assert.equal(response.json.method, method)
    assert.equal(response.json.url, path)
    assert.deepEqual(response.json.tenantHeaders, [])
    assert.equal(response.json.authorizationPresent, true)
    if (body !== undefined)
      assert.equal(response.json.bodySha256, createHash('sha256').update(body).digest('hex'))
  }

  const secretMaterialPath = `/api/v1/settings/secrets/${secretMaterialKeyMarker}/material`
  const secretMaterial = await request(port, `${secretMaterialPath}?fixture-cache=public`, {
    headers: { 'X-Tenant-ID': 'attacker', Authorization: 'Bearer fixture' },
  })
  assert.equal(secretMaterial.status, 200)
  assert.equal(secretMaterial.headers['cache-control'], 'no-store')
  assertSecurityHeaders(secretMaterial)
  assert.equal(secretMaterial.json.listener, 'primary')
  assert.equal(secretMaterial.json.method, 'GET')
  assert.equal(secretMaterial.json.url, `${secretMaterialPath}?fixture-cache=public`)
  assert.deepEqual(secretMaterial.json.tenantHeaders, [])
  assert.equal(secretMaterial.json.authorizationPresent, true)
  assert.equal(secretMaterial.json.bodyBytes, 0)

  const encodedSeparatorPath =
    '/api/v1/settings/secrets/edge-secret%2Fmaterial-key/material?fixture-cache=public'
  const encodedSeparator = await request(port, encodedSeparatorPath, {
    headers: { 'X-Tenant-ID': 'attacker', Authorization: 'Bearer fixture' },
  })
  assert.equal(encodedSeparator.status, 200)
  assert.equal(encodedSeparator.headers['cache-control'], 'no-store')
  assert.equal(encodedSeparator.json.listener, 'primary')
  assert.equal(encodedSeparator.json.method, 'GET')
  assert.equal(encodedSeparator.json.url, encodedSeparatorPath)
  assert.deepEqual(encodedSeparator.json.tenantHeaders, [])
  assert.equal(encodedSeparator.json.authorizationPresent, true)
  assert.equal(encodedSeparator.json.bodyBytes, 0)

  const materialFailure = await request(
    port,
    `${secretMaterialPath}?fixture-status=418&fixture-cache=public&fixture-security=hostile`,
    { headers: { Authorization: 'Bearer fixture' } },
  )
  assert.equal(materialFailure.status, 418)
  assert.equal(materialFailure.headers['cache-control'], 'no-store')
  assertSecurityHeaders(materialFailure)
  assert.equal(materialFailure.headers['content-security-policy-report-only'], undefined)

  for (const path of [
    `/api/v1/settings/secrets/${secretMaterialKeyMarker}/Material?fixture-cache=public`,
    `/api/v1/settings/secrets/${secretMaterialKeyMarker}/material/extra?fixture-cache=public`,
    '/api/v1/settings/secrets//material?fixture-cache=public',
  ]) {
    const nearMiss = await request(port, path, {
      headers: { 'X-Tenant-ID': 'attacker', Authorization: 'Bearer fixture' },
    })
    assert.equal(nearMiss.status, 200)
    assert.equal(nearMiss.headers['cache-control'], 'public, max-age=3600')
    assert.equal(nearMiss.json.listener, 'primary')
    assert.deepEqual(nearMiss.json.tenantHeaders, [])
    assert.equal(nearMiss.json.authorizationPresent, true)
  }

  for (const path of [
    '/api/v1/identity/policies?limit=50',
    '/api/v1/identity/policies/rss-web-policy-read',
  ]) {
    const response = await request(port, path, {
      headers: { 'X-Tenant-ID': 'attacker', Authorization: 'Bearer fixture' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.json.listener, 'primary')
    assert.equal(response.json.method, 'GET')
    assert.equal(response.json.url, path)
    assert.deepEqual(response.json.tenantHeaders, [])
    assert.equal(response.json.authorizationPresent, true)
  }

  for (const [method, path, body] of [
    [
      'POST',
      '/api/v1/identity/policies',
      JSON.stringify({
        policyId: 'rss-web-policy-write',
        contractId: 'identity.policies-list',
        permission: 'identity:policy:read',
        effectiveFrom: 1700000000,
        rules: [],
      }),
    ],
    [
      'PUT',
      '/api/v1/identity/policies/rss-web-policy-write',
      JSON.stringify({
        expectedVersion: 1,
        contractId: 'identity.policies-list',
        permission: 'identity:policy:read',
        effectiveFrom: 1700000000,
        rules: [],
      }),
    ],
    [
      'POST',
      '/api/v1/identity/policies/rss-web-policy-write/deactivate',
      JSON.stringify({ expectedVersion: 2 }),
    ],
  ]) {
    const response = await request(port, path, {
      method,
      headers: {
        'X-Tenant-ID': 'attacker',
        Authorization: 'Bearer fixture',
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      },
      body,
    })
    assert.equal(response.status, 200)
    assert.equal(response.json.listener, 'primary')
    assert.equal(response.json.method, method)
    assert.equal(response.json.url, path)
    assert.deepEqual(response.json.tenantHeaders, [])
    assert.equal(response.json.authorizationPresent, true)
    assert.equal(response.json.bodySha256, createHash('sha256').update(body).digest('hex'))
  }

  const roleBody = JSON.stringify({ subject: 'target@example.test' })
  const roleAssign = await request(port, '/api/v1/identity/roles/ops%3Aadmin/bindings', {
    method: 'POST',
    headers: {
      'X-Tenant-ID': 'attacker',
      Authorization: 'Bearer fixture',
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(roleBody)),
    },
    body: roleBody,
  })
  assert.equal(roleAssign.status, 200)
  assert.equal(roleAssign.json.listener, 'primary')
  assert.equal(roleAssign.json.method, 'POST')
  assert.deepEqual(roleAssign.json.tenantHeaders, [])
  assert.equal(roleAssign.json.authorizationPresent, true)
  assert.equal(roleAssign.json.bodySha256, createHash('sha256').update(roleBody).digest('hex'))

  const roleRevoke = await request(
    port,
    '/api/v1/identity/roles/ops%3Aadmin/bindings/target%40example.test',
    {
      method: 'DELETE',
      headers: { 'X-Tenant-ID': 'attacker', Authorization: 'Bearer fixture' },
    },
  )
  assert.equal(roleRevoke.status, 200)
  assert.equal(roleRevoke.json.listener, 'primary')
  assert.equal(roleRevoke.json.method, 'DELETE')
  assert.deepEqual(roleRevoke.json.tenantHeaders, [])
  assert.equal(roleRevoke.json.authorizationPresent, true)

  const opaqueSubject = 'target/with ?#%/雪'
  const encodedSubject = encodeURIComponent(opaqueSubject)
  const opaqueRoleRevoke = await request(
    port,
    `/api/v1/identity/roles/ops%3Aadmin/bindings/${encodedSubject}`,
    {
      method: 'DELETE',
      headers: { 'X-Tenant-ID': 'attacker', Authorization: 'Bearer fixture' },
    },
  )
  assert.equal(opaqueRoleRevoke.status, 200)
  assert.equal(opaqueRoleRevoke.json.listener, 'primary')
  assert.equal(opaqueRoleRevoke.json.method, 'DELETE')
  assert.equal(
    opaqueRoleRevoke.json.url,
    `/api/v1/identity/roles/ops%3Aadmin/bindings/${encodedSubject}`,
  )
  assert.deepEqual(opaqueRoleRevoke.json.tenantHeaders, [])
  assert.equal(opaqueRoleRevoke.json.authorizationPresent, true)

  const edgeLogs = docker(['logs', 'edge'], { env: environment })
  assert.equal(edgeLogs.status, 0)
  const accessOutput = `${edgeLogs.stdout}${edgeLogs.stderr}`
  assert(!accessOutput.includes(opaqueSubject))
  assert(!accessOutput.includes(encodedSubject))
  for (const marker of [...secretCoordinateMarkers, secretMaterialKeyMarker])
    assert(!accessOutput.includes(marker))

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
  assertSecurityHeaders(errorResponse)

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
    const negative = await request(port, path)
    assert.equal(negative.status, 404, path)
    assertSecurityHeaders(negative)
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
  const adminUnavailable = await request(port, '/api/v1/runtime/inventory')
  assertGatewayUnavailable(adminUnavailable.status)
  assertSecurityHeaders(adminUnavailable)
  assert.equal((await request(port, '/api/v1/identity/profile')).status, 200)
  assert.equal((await request(port, '/')).status, 200)

  result = docker(['start', 'admin'], { env: environment })
  assert.equal(result.status, 0)
  result = docker(['stop', 'primary'], { env: environment })
  assert.equal(result.status, 0)
  assertGatewayUnavailable((await request(port, '/api/v1/identity/profile')).status)
  assert.equal((await request(port, '/api/v1/audit/entries')).status, 200)
} finally {
  const cleanup = docker(['down', '--volumes', '--remove-orphans'], {
    env: environment,
    stdio: 'inherit',
  })
  assert.equal(cleanup.status, 0, `edge fixture cleanup failed for project ${project}`)
}
