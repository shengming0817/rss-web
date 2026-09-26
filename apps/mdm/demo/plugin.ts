import type { Plugin } from 'vite'
import { MDM_JSON_BODY_LIMIT } from '@rss/api/mdm-limits'
import { createScenario } from './scenario'
import { createDeviceDemo } from './devices/state'
export function demoPlugin(): Plugin {
  return {
    name: 'mdm-http-demo',
    transformIndexHtml(html) {
      return html.replace('/src/main.ts', '/demo/main.ts')
    },
    configureServer(server) {
      const devices = createDeviceDemo()
      const scenario = createScenario([devices.handle], devices.reset)
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next()
          return
        }
        try {
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of req) {
            const bytes = Buffer.from(chunk as Uint8Array)
            size += bytes.length
            if (size > MDM_JSON_BODY_LIMIT) {
              res.writeHead(413).end()
              return
            }
            chunks.push(bytes)
          }
          const raw = Buffer.concat(chunks).toString('utf8')
          const reply = await scenario.handle(
            req.method ?? 'GET',
            req.url,
            raw ? JSON.parse(raw) : undefined,
            req.headers,
          )
          res.writeHead(reply.status, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          })
          res.end(reply.body === undefined ? undefined : JSON.stringify(reply.body))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ code: 'malformed_request' }))
        }
      })
    },
  }
}
