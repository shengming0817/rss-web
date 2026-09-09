import process from 'node:process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(process.argv[2] ?? 'apps/identity/dist')
const meta = JSON.parse(readFileSync(resolve(root, 'identity-build.json'), 'utf8'))
if (!/^[0-9a-f]{40}$/.test(meta.revision)) throw new Error('Missing Identity build source')
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      scan(path)
      continue
    }
    if (entry.name.endsWith('.map')) throw new Error('Unexpected sourcemap')
    const content = readFileSync(path, 'utf8')
    if (/Bearer |accessToken|refreshToken|\/api\/v1\/identity\/|MOCK_SOURCE/.test(content))
      throw new Error('Legacy or mock Identity code in build')
  }
}
scan(root)
console.log('Identity build boundary passed')
