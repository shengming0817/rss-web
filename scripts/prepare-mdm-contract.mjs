import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { executeBounded } from '../e2e/identity/process.mjs'
import { contractSha256, readContractPin } from './contract-source.mjs'

const git = '/usr/bin/git'
const source = await readContractPin()
const directory = new URL('../contracts/mdm/', import.meta.url)
const target = new URL('http-v1.json', directory)
const cached = await readFile(target).catch((error) => {
  if (error.code !== 'ENOENT') throw error
})

if (!cached || contractSha256(cached) !== source.sha256) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  const localGitVars = execFileSync(git, ['rev-parse', '--local-env-vars'], {
    encoding: 'utf8',
    timeout: 5_000,
  })
  for (const key of localGitVars.trim().split('\n')) {
    if (key !== 'GIT_CONFIG_COUNT') delete env[key]
  }
  const checkout = await mkdtemp(fileURLToPath(new URL('.prepare-', directory)))
  let interrupted = false
  let terminate
  const interrupt = () => {
    interrupted = true
    terminate?.()
  }
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', interrupt)

  async function run(command, args, timeoutMs = 180_000) {
    if (interrupted) throw new Error('MDM contract preparation interrupted')
    const result = await executeBounded(command, args, {
      cwd: checkout,
      env,
      timeoutMs,
      graceMs: 10_000,
      stdio: ['ignore', 'inherit', 'pipe'],
      onChild: (_child, stop) => {
        terminate = stop
      },
      onRelease: () => {
        terminate = undefined
      },
    })
    if (interrupted) throw new Error('MDM contract preparation interrupted')
    if (result.timedOut) throw new Error(`${command} timed out preparing the MDM contract`)
    if (result.status !== 0) {
      const detail = result.stderr.trim().replace(/https?:\/\/[^\s/]+@/g, 'https://[redacted]@')
      throw new Error(`${command} failed preparing the MDM contract\n${detail}`)
    }
  }

  try {
    await run(git, ['init', '--quiet'])
    await run(git, [
      'fetch',
      '--quiet',
      '--no-tags',
      '--depth=1',
      source.repository,
      source.revision,
    ])
    await run(git, ['checkout', '--quiet', '--detach', source.revision])
    await run('python3', ['hack/http_contract_artifact.py', '--output', 'http-v1.json'], 1_200_000)
    const exported = join(checkout, 'http-v1.json')
    if (contractSha256(await readFile(exported)) !== source.sha256)
      throw new Error(`Exported MDM contract at ${source.revision} differs from its pin`)
    if (interrupted) throw new Error('MDM contract preparation interrupted')
    await rename(exported, target)
  } finally {
    try {
      await rm(checkout, { recursive: true, force: true })
    } finally {
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', interrupt)
    }
  }
}
