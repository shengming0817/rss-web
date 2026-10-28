import process from 'node:process'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, open, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { setTimeout, clearTimeout } from 'node:timers'

const root = new URL('../', import.meta.url)
const directory = new URL('packages/api/src/generated/', root)
const target = new URL('mdm/', directory)
const stamp = new URL('.mdm-inputs.json', directory)
const lock = new URL('.mdm-lock', directory)
const hash = createHash('sha256')
for (const path of [
  'contracts/mdm/source.json',
  'contracts/mdm/http-v1.json',
  'scripts/contract-source.mjs',
  'scripts/generate-contracts.mjs',
  'scripts/ensure-contracts.mjs',
  'pnpm-lock.yaml',
  '.prettierrc',
]) {
  hash
    .update(path)
    .update('\0')
    .update(await readFile(new URL(path, root)))
}
const fingerprint = hash.digest('hex')
let owner
let child
let interrupted
let escalation
function killChild(signal) {
  if (!child?.pid) return
  try {
    if (process.platform === 'win32') child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}
function stop(signal) {
  interrupted ??= signal
  killChild(signal)
  if (child && !escalation) escalation = setTimeout(() => killChild('SIGKILL'), 5000)
}
const onInterrupt = () => stop('SIGINT')
const onTerminate = () => stop('SIGTERM')
process.on('SIGINT', onInterrupt)
process.on('SIGTERM', onTerminate)
function checkInterrupted() {
  if (interrupted) throw new Error(`MDM contract generation interrupted (${interrupted})`)
}
async function current() {
  try {
    if (!owner && (await readFile(lock, 'utf8').catch(() => null)) !== null) return false
    const previous = JSON.parse(await readFile(stamp, 'utf8'))
    return previous.fingerprint === fingerprint && (await readdir(target)).length === previous.files
  } catch {
    return false
  }
}
async function generate(check = false) {
  checkInterrupted()
  let timeout
  try {
    const result = await new Promise((resolve, reject) => {
      child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL('scripts/generate-contracts.mjs', root)),
          ...(check ? ['--check'] : []),
        ],
        { cwd: fileURLToPath(root), stdio: 'inherit', detached: process.platform !== 'win32' },
      )
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
      timeout = setTimeout(() => stop('SIGTERM'), 300_000)
    })
    checkInterrupted()
    if (result.code !== 0)
      throw new Error(`Contract generation failed (${result.signal ?? result.code})`)
  } finally {
    clearTimeout(timeout)
    clearTimeout(escalation)
    escalation = undefined
    child = undefined
  }
}
try {
  const force = process.argv.includes('--force')
  if (force || !(await current())) {
    await mkdir(directory, { recursive: true })
    const deadline = Date.now() + 330_000
    while (!owner) {
      checkInterrupted()
      try {
        owner = await open(lock, 'wx')
        await owner.writeFile(String(process.pid))
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
        const pid = Number(await readFile(lock, 'utf8').catch(() => ''))
        if (Number.isSafeInteger(pid) && pid > 0) {
          try {
            process.kill(pid, 0)
          } catch (error) {
            if (error.code !== 'ESRCH') throw error
            throw new Error(`Interrupted MDM generation: remove ${fileURLToPath(lock)} and retry`)
          }
        }
        if (Date.now() >= deadline) throw new Error('Timed out waiting for MDM contract generation')
        await delay(100)
      }
    }
    if (force || !(await current())) {
      await unlink(stamp).catch((error) => {
        if (error.code !== 'ENOENT') throw error
      })
      await generate()
      checkInterrupted()
      await writeFile(stamp, JSON.stringify({ fingerprint, files: (await readdir(target)).length }))
    }
  }
  if (process.argv.includes('--check')) await generate(true)
} finally {
  if (owner) {
    await owner.close()
    await unlink(lock)
  }
  process.off('SIGINT', onInterrupt)
  process.off('SIGTERM', onTerminate)
}
