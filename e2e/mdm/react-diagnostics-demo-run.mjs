// Reuse the repository's bounded child/process-group owner, including interruption and cleanup grace.
import { executeBounded } from '../identity/process.mjs'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
let terminate,
  interrupted = false
const stop = () => {
  interrupted = true
  terminate?.()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
try {
  const result = await executeBounded(
    process.execPath,
    [fileURLToPath(new URL('./react-diagnostics-demo-browser.mjs', import.meta.url))],
    {
      timeoutMs: 150000,
      graceMs: 15000,
      stdio: ['ignore', 'inherit', 'inherit'],
      onChild: (_child, cancel) => {
        terminate = cancel
        if (interrupted) cancel()
      },
      onRelease: () => {
        terminate = undefined
      },
    },
  )
  if (interrupted || result.timedOut || result.status !== 0)
    throw new Error('execution-or-cleanup-unconfirmed')
} catch (error) {
  process.exitCode = 1
  console.error(
    JSON.stringify({
      journey: 'react-diagnostics-explicit-mock',
      result: 'failed',
      classification: error.message,
    }),
  )
} finally {
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
}
