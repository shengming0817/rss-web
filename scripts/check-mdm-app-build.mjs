import process from 'node:process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(process.argv[2] ?? 'apps/mdm/dist')
if (!readFileSync(resolve(root, 'index.html'), 'utf8').includes('<title>RSS MDM</title>'))
  throw new Error('Incorrect product output')
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      scan(file)
      continue
    }
    if (entry.name.endsWith('.map')) throw new Error('Unexpected sourcemap')
    const text = readFileSync(file, 'utf8')
    if (
      /Bearer |accessToken|refreshToken|MOCK_SOURCE|Synthetic data; login demo|mdm-http-demo|Synthetic demo artifact; no device execution|workspace\/scenario/.test(
        text,
      )
    )
      throw new Error('Legacy or demo implementation in production build')
  }
}
scan(root)
console.log('MDM production boundary passed')
