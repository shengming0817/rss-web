import { spawn } from 'node:child_process'
import process from 'node:process'

spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {
  stdio: ['ignore', 'inherit', 'inherit'],
})
process.on('SIGTERM', () => undefined)
setInterval(() => undefined, 1_000)
