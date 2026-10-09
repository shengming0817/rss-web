// Build this checkout, then consume a disposable real backend through HTTPS Chromium.
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import assert from 'node:assert/strict'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const backend = process.env.MDM_DEVICE_BACKEND
assert.ok(backend, 'MDM_DEVICE_BACKEND must point to an rss-mdm checkout')
process.env.MDM_DEVICE_BACKEND = resolve(backend)
let active
async function run(command, args, cwd, timeout) {
  await new Promise((success, failure) => {
    active = spawn(command, args, { cwd, stdio: 'inherit', env: process.env, detached: true })
    const timer = setTimeout(() => {
      process.kill(-active.pid, 'SIGTERM')
    }, timeout)
    active.once('error', failure)
    active.once('exit', (code) => {
      clearTimeout(timer)
      active = undefined
      if (code === 0) success()
      else failure(new Error('device acceptance failed'))
    })
  })
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    if (active) process.kill(-active.pid, signal)
  })
try {
  await run('pnpm', ['build:mdm'], root, 600000)
  await run(
    'python3',
    ['hack/build_run.py', '--', 'python3', resolve(root, 'e2e/mdm/device-fixture.py'), root],
    resolve(backend),
    3600000,
  )
} catch {
  process.exitCode = 1
}
