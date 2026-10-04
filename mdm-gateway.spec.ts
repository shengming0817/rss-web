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
