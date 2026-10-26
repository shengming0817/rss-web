import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
const root = resolve(process.argv[2] ?? 'apps/device-access/dist')
if (!readFileSync(resolve(root, 'index.html'), 'utf8').includes('<title>RSS Device Access</title>'))
  throw new Error('Wrong DA product')
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      scan(file)
      continue
    }
    if (entry.name.endsWith('.map')) throw new Error('Sourcemap in DA production')
    const text = readFileSync(file, 'utf8')
    if (
      /MOCK_SOURCE|rss-da-demo|\/api\/da-demo|device-access-http-demo|demo\/main|Bearer |accessToken|refreshToken/.test(
        text,
      )
    )
      throw new Error('Demo or legacy authentication in DA production')
  }
}
scan(root)
console.log('Device Access production boundary passed')
