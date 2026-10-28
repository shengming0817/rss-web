import process from 'node:process'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, open, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setTimeout } from 'node:timers/promises'

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
async function current() {
  try {
    const previous = JSON.parse(await readFile(stamp, 'utf8'))
    return previous.fingerprint === fingerprint && (await readdir(target)).length === previous.files
  } catch {
    return false
  }
}
function generate(check = false) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('scripts/generate-contracts.mjs', root)), ...(check ? ['--check'] : [])],
    { cwd: fileURLToPath(root), stdio: 'inherit', timeout: 300_000 },
  )
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`Contract generation failed (${result.signal ?? result.status})`)
}
const force = process.argv.includes('--force')
if (force || !(await current())) {
  await mkdir(directory, { recursive: true })
  const deadline = Date.now() + 330_000
  let owner
  while (!owner) {
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
      await setTimeout(100)
    }
  }
  try {
    if (force || !(await current())) {
      generate()
      await writeFile(stamp, JSON.stringify({ fingerprint, files: (await readdir(target)).length }))
    }
  } finally {
    await owner.close()
    await unlink(lock)
  }
}
if (process.argv.includes('--check')) generate(true)
