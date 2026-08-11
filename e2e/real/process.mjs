import { spawn } from 'node:child_process'

export function executeBounded(command, args, options = {}) {
  const timeoutMs = options.timeoutMs
  const graceMs = options.graceMs ?? 2_000
  return new Promise((resolve, reject) => {
    const child = (options.spawn ?? spawn)(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio ?? ['pipe', 'inherit', 'inherit'],
    })
    options.onChild?.(child)
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let graceTimer
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => (stdout += chunk))
    child.stderr?.on('data', (chunk) => (stderr += chunk))
    if (options.input !== undefined) child.stdin?.end(options.input)
    else child.stdin?.end()

    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      clearTimeout(graceTimer)
      options.onRelease?.(child)
      callback()
    }
    const timeoutTimer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      graceTimer = setTimeout(() => child.kill('SIGKILL'), graceMs)
    }, timeoutMs)

    child.once('error', (cause) => finish(() => reject(cause)))
    child.once('close', (status, signal) =>
      finish(() => resolve({ status, signal, stdout, stderr, timedOut })),
    )
  })
}
