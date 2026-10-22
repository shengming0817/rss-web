import process from 'node:process'
import assert from 'node:assert/strict'
assert.ok(
  process.env.MDM_OPERATIONS_BACKEND,
  'MDM_OPERATIONS_BACKEND must point to an rss-mdm checkout',
)
process.env.MDM_DEVICE_BACKEND = process.env.MDM_OPERATIONS_BACKEND
process.env.MDM_DEVICE_BROWSER_MODULE = 'operations-browser.mjs'
await import('./device-run.mjs')
