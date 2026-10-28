// Reuse the existing bounded build, HTTPS fixture and independent cleanup lifecycle.
import process from 'node:process'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
assert.ok(process.env.MDM_CONSOLE_BACKEND, 'MDM_CONSOLE_BACKEND must point to rss-mdm')
const pin = JSON.parse(
  readFileSync(new URL('../../contracts/mdm/source.json', import.meta.url), 'utf8'),
)
assert.equal(
  execFileSync('/usr/bin/git', ['-C', process.env.MDM_CONSOLE_BACKEND, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  pin.revision,
  'contract HTTP fixture must use the fixed producer commit',
)
process.env.MDM_DEVICE_BACKEND = process.env.MDM_CONSOLE_BACKEND
process.env.MDM_DEVICE_BROWSER_MODULE = 'console-browser.mjs'
await import('./device-run.mjs')
