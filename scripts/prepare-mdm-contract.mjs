import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { contractSha256, readContractPin } from './contract-source.mjs'

const source = await readContractPin()
const directory = new URL('../contracts/mdm/', import.meta.url)
const target = new URL('http-v1.json', directory)
const cached = await readFile(target).catch((error) => {
  if (error.code !== 'ENOENT') throw error
})

if (!cached || contractSha256(cached) !== source.sha256) {
  const checkout = await mkdtemp(fileURLToPath(new URL('.prepare-', directory)))
  try {
    const options = {
      cwd: checkout,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: 'inherit',
    }
    execFileSync('/usr/bin/git', ['init', '--quiet'], options)
    execFileSync(
      '/usr/bin/git',
      ['fetch', '--quiet', '--no-tags', '--depth=1', source.repository, source.revision],
      options,
    )
    execFileSync('/usr/bin/git', ['checkout', '--quiet', '--detach', source.revision], options)
    execFileSync('python3', ['hack/http_contract_artifact.py', '--output', 'http-v1.json'], options)
    const exported = join(checkout, 'http-v1.json')
    if (contractSha256(await readFile(exported)) !== source.sha256)
      throw new Error(`Exported MDM contract at ${source.revision} differs from its pin`)
    await rename(exported, target)
  } finally {
    await rm(checkout, { recursive: true, force: true })
  }
}
