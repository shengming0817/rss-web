import { spawn } from 'node:child_process'
import process from 'node:process'

function signalProcessTree(child, signal, detached) {
  if (detached && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error
    }
  }
  child.kill(signal)
}

export function executeBounded(command, args, options = {}) {
  const timeoutMs = options.timeoutMs
  const graceMs = options.graceMs ?? 2_000
  return new Promise((resolve, reject) => {
    const detached = options.detached ?? process.platform !== 'win32'
    const child = (options.spawn ?? spawn)(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio ?? ['pipe', 'inherit', 'inherit'],
      detached,
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let graceTimer
    let terminating = false
    const terminate = () => {
      if (terminating) return
      terminating = true
      signalProcessTree(child, 'SIGTERM', detached)
      graceTimer = setTimeout(() => signalProcessTree(child, 'SIGKILL', detached), graceMs)
    }
    options.onChild?.(child, terminate)
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
      terminate()
    }, timeoutMs)

    child.once('error', (cause) => finish(() => reject(cause)))
    child.once('close', (status, signal) =>
      finish(() => resolve({ status, signal, stdout, stderr, timedOut })),
    )
  })
}
