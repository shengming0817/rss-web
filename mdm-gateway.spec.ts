import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
it('reserves the raw upload body exception for the exact resource content location', () => {
  const config = readFileSync(new URL('./deploy/mdm/gateway.conf.example', import.meta.url), 'utf8')
  expect(config).toMatch(/client_max_body_size 16k;/)
  const upload = config.match(
    /location ~ (\^\/api\/v3\/resources\/\[\^\/\]\+\/content\$)\s*\{([^}]+)\}/,
  )
  expect(upload).not.toBeNull()
  const path = new RegExp(upload![1]!)
  expect(path.test('/api/v3/resources/script/content')).toBe(true)
  for (const invalid of [
    '/api/v3/resources/script/content/extra',
    '/api/v3/resources/script',
    '/api/v2/groups/group',
  ])
    expect(path.test(invalid)).toBe(false)
  expect(upload![2]).toContain('client_max_body_size 16m;')
  expect(upload![2]).toContain('limit_req zone=mdm_api burst=20 nodelay;')
  expect(upload![2]).toContain('proxy_pass http://mdm:8080;')
  expect(config.indexOf(upload![0])).toBeLessThan(config.indexOf('location ~ ^/api/(identity-host'))
  expect(config).toContain('proxy_next_upstream off;')
})
