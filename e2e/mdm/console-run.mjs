// Reuse the existing bounded build, HTTPS fixture and independent cleanup lifecycle.
import process from 'node:process'
import assert from 'node:assert/strict'
assert.ok(process.env.MDM_CONSOLE_BACKEND, 'MDM_CONSOLE_BACKEND must point to rss-mdm')
process.env.MDM_DEVICE_BACKEND = process.env.MDM_CONSOLE_BACKEND
process.env.MDM_DEVICE_BROWSER_MODULE = 'console-browser.mjs'
await import('./device-run.mjs')
