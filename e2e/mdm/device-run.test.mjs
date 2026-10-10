// Process lifecycle regression only; real provider/UI acceptance uses device-run.mjs.
import { test } from 'node:test'
import process from 'node:process'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

async function waitFor(predicate) {
  const end = Date.now() + 18000
  while (!predicate()) {
    if (Date.now() > end) throw new Error('lifecycle deadline')
    await new Promise((done) => setTimeout(done, 20))
  }
}
async function exercise(failure) {
  const backend = mkdtempSync(resolve(tmpdir(), 'mdm-device-lifecycle-'))
  const bin = resolve(backend, 'bin'),
    recovery = resolve(backend, 'artifacts/dev-environment/device-browser')
  mkdirSync(bin)
  mkdirSync(recovery, { recursive: true })
  writeFileSync(resolve(bin, 'pnpm'), '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  writeFileSync(
    resolve(bin, 'python3'),
    `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path')
const args = process.argv.slice(2), base = process.env.MDM_DEVICE_BACKEND
if (args.includes('reset')) {
  if (!args.includes('hack/t2_environment.py') || args.at(-1) !== 'device-browser') process.exit(9)
  fs.writeFileSync(path.join(base, 'cleanup-start'), '')
  setTimeout(() => {
    if (process.env.CLEANUP_FAILURE === '1') process.exit(3)
    fs.rmSync(path.join(base, 'artifacts/dev-environment/device-browser'), { recursive: true })
    fs.writeFileSync(path.join(base, 'cleanup-finished'), '')
    process.exit(0)
  }, process.env.CLEANUP_FAILURE === '1' ? 0 : 7000)
} else {
  fs.writeFileSync(path.join(base, 'execution-start'), '')
  if (process.env.CLEANUP_FAILURE === '1') process.exit(2)
  // A foreign execution runner may force-terminate rather than complete cleanup.
  process.on('SIGTERM', () => {})
  setInterval(() => {}, 1000)
}
`,
    { mode: 0o700 },
  )
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./device-run.mjs', import.meta.url))],
    {
      env: {
        ...process.env,
        MDM_DEVICE_BACKEND: backend,
        PATH: `${bin}:${process.env.PATH}`,
        CLEANUP_FAILURE: failure ? '1' : '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  const closed = new Promise((done, reject) => {
    child.once('error', reject)
    child.once('close', (code) => done(code))
  })
  try {
    if (!failure) {
      await waitFor(() => existsSync(resolve(backend, 'execution-start')))
      child.kill('SIGTERM')
      await waitFor(() => existsSync(resolve(backend, 'cleanup-start')))
      // A second cancellation must not cancel the independent cleanup owner.
      child.kill('SIGTERM')
    }
    const code = await closed
    assert.equal(code, 1)
    if (failure) {
      assert.ok(existsSync(recovery))
      assert.ok(output.includes(JSON.stringify(recovery)))
      assert.ok(output.includes('"phase":"cleanup","result":"failed"'))
    } else {
      assert.ok(existsSync(resolve(backend, 'cleanup-finished')))
      assert.equal(existsSync(recovery), false)
      assert.ok(output.includes('"classification":"interrupted"'))
      assert.ok(output.includes('"phase":"cleanup","result":"passed"'))
    }
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL')
    await closed
    rmSync(backend, { recursive: true, force: true })
  }
}
test(
  'waits for seven-second cleanup after forced execution cancellation and a second signal',
  { timeout: 30000 },
  () => exercise(false),
)
test(
  'fails and reports the recovery directory when independent cleanup fails',
  { timeout: 30000 },
  () => exercise(true),
)
