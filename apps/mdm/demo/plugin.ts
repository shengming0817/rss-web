import type { Plugin } from 'vite'
import { createScenario } from './scenario'
export function demoPlugin(): Plugin {
  return {
    name: 'mdm-http-demo',
    transformIndexHtml(html) {
      return html.replace('/src/main.ts', '/demo/main.ts')
    },
    configureServer(server) {
      const scenario = createScenario()
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
            if (size > 1024 * 1024) {
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
