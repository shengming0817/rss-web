import process from 'node:process'

process.on('SIGTERM', () => undefined)
setInterval(() => undefined, 1_000)
