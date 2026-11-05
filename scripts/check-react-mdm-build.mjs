import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/mdm/dist')
if (!readFileSync(resolve(root, 'index.html'), 'utf8').includes('<title>RSS MDM</title>'))
  throw new Error('Incorrect React MDM product output')
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      scan(file)
      continue
    }
    if (entry.name.endsWith('.map')) throw new Error('Unexpected source map')
    const content = readFileSync(file, 'utf8')
    if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(content))
      throw new Error('Runtime code compilation')
    if (
      /Bearer |accessToken|refreshToken|mdm-http-demo|MOCK_SOURCE|workspace\/scenario|rss-ui-preview-only/.test(
        content,
      )
    )
      throw new Error('Credential fallback or demo in product output')
  }
}
scan(root)
console.log('React MDM production boundary passed')
