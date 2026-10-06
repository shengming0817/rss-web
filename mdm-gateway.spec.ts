import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
it('reserves raw upload budgets for exact resource content and session chunk locations', () => {
  const config = readFileSync(new URL('./deploy/mdm/gateway.conf.example', import.meta.url), 'utf8')
  expect(config).toMatch(/client_max_body_size 16k;/)
  const upload = config.match(/location ~ (\^\/api\/v1\/resources\/[^\s]+)\s*\{([^}]+)\}/)
  expect(upload).not.toBeNull()
  const path = new RegExp(upload![1]!)
  for (const valid of [
    '/api/v1/resources/script/content',
    '/api/v1/resources/app/uploads/11111111-1111-4111-8111-111111111111',
  ])
    expect(path.test(valid)).toBe(true)
  for (const invalid of [
    '/api/v1/resources/script/content/extra',
    '/api/v1/resources/app/uploads/11111111-1111-4111-8111-111111111111/complete',
    '/api/v1/resources/app/uploads/',
    '/api/v1/resources/app/uploads/id/extra',
    '/api/v1/resources/script',
    '/api/v1/groups/group',
  ])
    expect(path.test(invalid)).toBe(false)
  expect(upload![2]).toContain('client_max_body_size 16m;')
  expect(upload![2]).toContain('limit_req zone=mdm_api burst=20 nodelay;')
  expect(upload![2]).toContain('proxy_pass http://mdm:8080;')
  expect(config.indexOf(upload![0])).toBeLessThan(
    config.indexOf('location ~ ^/api/v1/(identity/tenants/'),
  )
  expect(config).toContain('proxy_next_upstream off;')
})
it('routes registration resources through the tenant business gateway without accepting adjacent prefixes', () => {
  const config = readFileSync(new URL('./deploy/mdm/gateway.conf.example', import.meta.url), 'utf8')
  const business = config.match(
    /location ~ (\^\/api\/v1\/\(identity\/tenants\/[^\s]+) \{([^}]+)\}/,
  )!
  expect(business).not.toBeNull()
  const path = new RegExp(business[1]!)
  for (const allowed of [
    '/api/v1/registration-quotas/me',
    '/api/v1/registration-quotas/defaults',
    '/api/v1/agent-configurations/id',
    '/api/v1/agent-enrollment-settings',
  ])
    expect(path.test(allowed)).toBe(true)
  for (const rejected of [
    '/api/v1/registration-quotas-extra',
    '/api/v1/self-enrollments-extra',
    '/api/v1/agent-grants-extra',
    '/api/v1/agent-grants/id',
    '/api/v1/self-enrollments/agent',
    '/api/v1/unrelated',
  ])
    expect(path.test(rejected)).toBe(false)
  expect(business[2]).toContain('limit_req zone=mdm_api burst=20 nodelay;')
  expect(business[2]).toContain('proxy_pass http://mdm:8080;')
  expect(config.indexOf(business[0])).toBeLessThan(config.indexOf('location /api/ { return 404; }'))
})

it('proxies only the published anonymous installer paths with TLS verification and no incoming credentials', () => {
  const config = readFileSync(new URL('./deploy/mdm/gateway.conf.example', import.meta.url), 'utf8')
  const location = config.match(
    /location ~ "(\^\/api\/v1\/agent\/enroll\/packages[^"]+)" \{([\s\S]*?)\n {4}\}/,
  )!
  const pattern = new RegExp(location[1]!)
  const id = '11111111-1111-4111-8111-111111111111'
  for (const path of ['', `/${id}`, `/${id}/content`])
    expect(pattern.test(`/api/v1/agent/enroll/packages${path}`)).toBe(true)
  for (const path of ['/private', `/${id}/private`, `/${id}/content/extra`, '/enroll', '/latest'])
    expect(pattern.test(`/api/v1/agent/enroll/packages${path}`)).toBe(false)
  expect(location[2]).toContain('proxy_pass_request_headers off;')
  expect(location[2]).toContain('proxy_ssl_verify on;')
  expect(location[2]).toContain('proxy_ssl_server_name on;')
  expect(location[2]).toContain('limit_except GET { deny all; }')
  expect(location[2]).not.toMatch(/proxy_set_header (Cookie|Authorization|X-CSRF|X-Identity)/i)
})

it('applies the ADE token budget at the first matching regex location', () => {
  const config = readFileSync(new URL('./deploy/mdm/gateway.conf.example', import.meta.url), 'utf8')
  const locations = [...config.matchAll(/location ~ (?:"([^"\n]+)"|(\S+)) \{([^\n]+)/g)]
  function budget(path: string) {
    const match = locations.find((location) => new RegExp(location[1] ?? location[2]!).test(path))
    return match?.[3]?.match(/client_max_body_size ([^;]+);/)?.[1] ?? '16k'
  }
  expect(budget('/api/v1/apple/organizations/id/ade/operations')).toBe('256k')
  expect(budget('/api/v1/apple/organizations/id/ade/configuration')).toBe('256k')
  expect(budget('/api/v1/apple/organizations/id/ade/profiles')).toBe('16k')
  expect(budget('/api/v1/apple/organizations/id/ade/operations/extra')).toBe('16k')
})
it('keeps the TOU frame policy tied to the original request across SPA fallback', () => {
  const config = readFileSync(new URL('./deploy/mdm/gateway.conf.example', import.meta.url), 'utf8')
  expect(config).toContain('map $request_uri $mdm_frame_ancestors')
  const rule = config.match(/~(\^\/enrollment\/[^\s]+) "https:\/\/login.microsoftonline.com"/)
  expect(rule).not.toBeNull()
  const path = new RegExp(rule![1]!)
  expect(path.test('/enrollment/windows/entra/terms')).toBe(true)
  expect(path.test('/enrollment/windows/entra/terms?mode=azureadjoin')).toBe(true)
  for (const other of ['/index.html', '/downloads/agent', '/enrollment/windows/entra/terms/extra'])
    expect(path.test(other)).toBe(false)
})
