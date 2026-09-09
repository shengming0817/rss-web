// Consumer-owned adapter acceptance. The backend supplies only a disposable test fixture.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const backend = process.env.IDENTITY_BACKEND_FIXTURE
if (!backend) throw new Error('IDENTITY_BACKEND_FIXTURE must locate the backend test checkout')
function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', timeout: 600_000 })
  if (result.error || result.status !== 0) throw new Error('Joint acceptance command failed')
}
function git(cwd, args) {
  const result = spawnSync('/usr/bin/git', args, { cwd, encoding: 'utf8', timeout: 10_000 })
  if (result.status !== 0) throw new Error('Source identity unavailable')
  return result.stdout.trim()
}
function source(cwd, lock) {
  if (git(cwd, ['status', '--porcelain', '--untracked-files=normal']))
    throw new Error('Joint acceptance requires committed source')
  return {
    revision: git(cwd, ['rev-parse', 'HEAD']),
    lock_sha256: digest(readFileSync(resolve(cwd, lock))),
  }
}
function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}
function artifact(directory) {
  const entries = []
  function visit(path) {
    for (const entry of readdirSync(path).sort()) {
      const file = resolve(path, entry)
      const stat = lstatSync(file)
      if (stat.isSymbolicLink()) throw new Error('Artifact symlinks are not supported')
      if (stat.isDirectory()) visit(file)
      else entries.push([relative(directory, file), digest(readFileSync(file))])
    }
  }
  visit(directory)
  return digest(JSON.stringify(entries))
}
const frontendSource = source(root, 'pnpm-lock.yaml')
const backendSource = source(backend, 'Cargo.lock')
run('pnpm', ['-F', '@rss/identity-app', 'build'], root, {
  ...process.env,
  RSS_IDENTITY_WEB_REVISION: frontendSource.revision,
})
run('pnpm', ['check:identity-app:build'], root)
const dist = resolve(root, 'apps/identity/dist')
const runner = resolve(root, 'e2e/identity/real.mjs')
const record = {
  frontend: frontendSource,
  backend: backendSource,
  artifact_sha256: artifact(dist),
  runner_sha256: digest(readFileSync(runner)),
  scope: 'Identity HTTP/UI adapter T2',
}
run('make', ['test-ui'], backend, {
  ...process.env,
  IDENTITY_UI_DIST: dist,
  IDENTITY_UI_RUNNER: runner,
})
if (
  artifact(dist) !== record.artifact_sha256 ||
  JSON.stringify(source(root, 'pnpm-lock.yaml')) !== JSON.stringify(frontendSource) ||
  JSON.stringify(source(backend, 'Cargo.lock')) !== JSON.stringify(backendSource)
)
  throw new Error('Acceptance inputs changed during execution')
const evidence = JSON.stringify({ ...record, result: 'passed' }, null, 2)
if (process.env.IDENTITY_JOINT_RECORD) writeFileSync(process.env.IDENTITY_JOINT_RECORD, evidence)
console.log(evidence)
