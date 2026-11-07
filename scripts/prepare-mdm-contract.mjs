import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
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
  const { RSS_AZURE_REPOS_READ_PAT: pat, ...env } = process.env
  env.GIT_TERMINAL_PROMPT = '0'
  const localGitVars = execFileSync(git, ['rev-parse', '--local-env-vars'], {
    encoding: 'utf8',
    timeout: 5_000,
  })
  for (const key of localGitVars.trim().split('\n')) {
    if (key !== 'GIT_CONFIG_COUNT') delete env[key]
  }
  if (env.CARGO_TARGET_DIR === undefined) {
    env.CARGO_TARGET_DIR = join(homedir(), '.cache/rss-web/mdm-http-contract')
    env.MDM_TARGET_POOL_N = '0'
  }

  const fetchEnv = { ...env }
  if (pat) {
    const index = Number(fetchEnv.GIT_CONFIG_COUNT ?? 0)
    fetchEnv.GIT_CONFIG_COUNT = String(index + 1)
    fetchEnv[`GIT_CONFIG_KEY_${index}`] =
      'http.https://dev.azure.com/shengming0923/rss/_git/.extraHeader'
    fetchEnv[`GIT_CONFIG_VALUE_${index}`] =
      `Authorization: Basic ${Buffer.from(`:${pat}`).toString('base64')}`
    fetchEnv.CARGO_NET_GIT_FETCH_WITH_CLI = 'true'
    env.CARGO_NET_OFFLINE = 'true'
  }

  const checkout = await mkdtemp(fileURLToPath(new URL('.prepare-', directory)))
  let cleanupConfirmed = true
  let interrupted = false
  let terminate
  const interrupt = () => {
    interrupted = true
    terminate?.()
  }
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP']
  for (const signal of signals) process.on(signal, interrupt)

  async function run(command, args, { childEnv = env, timeoutMs = 180_000, build = false } = {}) {
    if (interrupted) throw new Error('MDM contract preparation interrupted')
    const result = await executeBounded(command, args, {
      cwd: checkout,
      env: childEnv,
      timeoutMs,
      graceMs: 10_000,
      stdio: ['ignore', 'inherit', build ? 'inherit' : 'pipe'],
      onChild: (_child, stop) => {
        terminate = stop
      },
      onRelease: () => {
        terminate = undefined
      },
    })
    // A killed build supervisor cannot confirm cleanup of its separate Cargo group.
    if (build && result.signal) {
      cleanupConfirmed = false
      throw new Error(`MDM export cleanup could not be confirmed. Checkout retained at ${checkout}`)
    }
    if (interrupted) throw new Error('MDM contract preparation interrupted')
    if (result.timedOut) throw new Error(`${command} timed out preparing the MDM contract`)
    if (result.status !== 0) {
      const detail = result.stderr.trim().replace(/https?:\/\/[^\s/]+@/g, 'https://[redacted]@')
      throw new Error(`${command} failed preparing the MDM contract${detail ? `\n${detail}` : ''}`)
    }
  }

  try {
    await run(git, ['init', '--quiet'])
    await run(
      git,
      ['fetch', '--quiet', '--no-tags', '--depth=1', source.repository, source.revision],
      { childEnv: fetchEnv },
    )
    await run(git, ['checkout', '--quiet', '--detach', source.revision])
    if (pat) await run('cargo', ['fetch', '--locked'], { childEnv: fetchEnv, timeoutMs: 600_000 })
    await run(
      'python3',
      [
        'hack/build_run.py',
        '--',
        'python3',
        'hack/http_contract_artifact.py',
        '--output',
        'http-v1.json',
      ],
      { timeoutMs: 1_200_000, build: true },
    )
    const exported = join(checkout, 'http-v1.json')
    if (contractSha256(await readFile(exported)) !== source.sha256)
      throw new Error(`Exported MDM contract at ${source.revision} differs from its pin`)
    const active = await readContractPin()
    if (active.revision !== source.revision || active.sha256 !== source.sha256)
      throw new Error('MDM contract pin changed during export. Run make prepare-contract again.')
    if (interrupted) throw new Error('MDM contract preparation interrupted')
    await rename(exported, target)
  } finally {
    try {
      if (cleanupConfirmed) await rm(checkout, { recursive: true, force: true })
    } finally {
      for (const signal of signals) process.off(signal, interrupt)
    }
  }
}
