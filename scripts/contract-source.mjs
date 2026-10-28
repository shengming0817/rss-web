import { Buffer } from 'node:buffer'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Read immutable Git objects. Neither a dirty checkout nor a moving branch is an input. */
export async function contractSource(root = new URL('../', import.meta.url)) {
  const source = JSON.parse(await readFile(new URL('contracts/mdm/source.json', root), 'utf8'))
  if (
    source.repository !== 'https://dev.azure.com/shengming0923/rss/_git/rss-mdm' ||
    !/^[a-f0-9]{40}$/.test(source.revision) ||
    source.path !== 'contracts/http-v1.json'
  )
    throw new Error('Invalid fixed MDM source')
  const repository =
    process.env.RSS_MDM_CONTRACT_GIT ?? join(homedir(), '.cache/rss-web/rss-mdm.git')
  const gitEnvironment = { ...process.env }
  if (process.env.RSS_MDM_GIT_TOKEN) {
    const count = Number(gitEnvironment.GIT_CONFIG_COUNT ?? 0)
    gitEnvironment.GIT_CONFIG_COUNT = String(count + 1)
    gitEnvironment[`GIT_CONFIG_KEY_${count}`] =
      'http.https://dev.azure.com/shengming0923/rss/_git/rss-mdm.extraheader'
    gitEnvironment[`GIT_CONFIG_VALUE_${count}`] =
      'Authorization: Basic ' + Buffer.from(':' + process.env.RSS_MDM_GIT_TOKEN).toString('base64')
  }
  const git = (...args) =>
    execFileSync('/usr/bin/git', ['-C', repository, ...args], {
      env: gitEnvironment,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    })
  try {
    git('cat-file', '-e', source.revision + '^{commit}')
  } catch {
    if (process.env.RSS_MDM_CONTRACT_GIT)
      throw new Error('Fixed commit missing from supplied Git object store')
    await mkdir(repository, { recursive: true })
    git('init', '--bare')
    git('fetch', '--no-tags', source.repository, source.revision)
  }
  if (git('cat-file', '-t', source.revision).toString().trim() !== 'commit')
    throw new Error('Source revision is not a commit')
  const blob = git('rev-parse', source.revision + ':' + source.path)
    .toString()
    .trim()
  const bytes = git('cat-file', 'blob', blob)
  if (blob !== source.blob || createHash('sha256').update(bytes).digest('hex') !== source.sha256)
    throw new Error('Fixed MDM Git source differs from its pin')
  // The producer owns structural validation and its dialect. Execute its pinned, standalone tool.
  const verifier = git('show', source.revision + ':hack/http_contract_artifact.py').toString()
  const validation = `import sys\nscope={'__name__':'contract_source','__file__':${JSON.stringify(join(repository, 'hack/http_contract_artifact.py'))}}\nexec(${JSON.stringify(verifier)},scope)\nscope['validate_document'](sys.stdin.buffer.read())`
  execFileSync('python3', ['-c', validation], {
    input: bytes,
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  })
  return { source, document: JSON.parse(bytes.toString()) }
}
