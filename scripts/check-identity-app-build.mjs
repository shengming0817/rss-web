import process from 'node:process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(process.argv[2] ?? 'apps/identity/dist')
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      scan(path)
      continue
    }
    if (entry.name.endsWith('.map')) throw new Error('Unexpected sourcemap')
    const content = readFileSync(path, 'utf8')
    if (
      /rss-ui-preview-only|RSS UI Components|Bearer |accessToken|refreshToken|MOCK_SOURCE|mdm-host|Enterprise device management/.test(
        content,
      )
    )
      throw new Error('Credential fallback or foreign composition in Identity build')
  }
}
scan(root)
console.log('Identity build boundary passed')
