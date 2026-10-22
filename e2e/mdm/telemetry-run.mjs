// Reuse the device journey's bounded process, lease and independent cleanup owner.
import process from 'node:process'
process.env.MDM_DEVICE_BROWSER_MODULE = 'telemetry-browser.mjs'
await import('./device-run.mjs')
