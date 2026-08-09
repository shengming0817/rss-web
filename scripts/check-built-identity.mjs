import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import process from 'node:process'

const target = resolve(process.argv[2] ?? 'apps/web/dist')
const legacyWord = ['go', 'cell'].join('')
const legacyIdentity = new RegExp(`@${legacyWord}/|${legacyWord}|go[ _-]cell`, 'i')
const violations = []

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name)
    const path = relative(target, absolute)
    if (legacyIdentity.test(path)) violations.push(`${path}:filename`)
    if (entry.isDirectory()) {
      scan(absolute)
    } else if (legacyIdentity.test(readFileSync(absolute).toString('latin1'))) {
      violations.push(`${path}:content`)
    }
  }
}

scan(target)
if (violations.length > 0) {
  console.error(`Legacy product identity found in build output:\n${violations.join('\n')}`)
  process.exitCode = 1
}
