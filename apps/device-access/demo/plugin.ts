import type { Plugin } from 'vite'
import { createDemoServer } from './server'
export function demoPlugin(): Plugin {
  return {
    name: 'device-access-http-demo',
    transformIndexHtml: (html) => html.replace('/src/main.ts', '/demo/main.ts'),
    configureServer(server) {
      const scenario = createDemoServer()
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next()
          return
        }
        // Loopback only; reject cross-origin writes and unexpected hosts in this explicit dev server.
        const host = req.headers.host ?? '',
          origin = req.headers.origin
        if (
          !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host) ||
          (origin && origin !== 'http://' + host)
        ) {
          res.writeHead(403).end()
          return
        }
        try {
          let size = 0
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            const bytes = Buffer.from(chunk as Uint8Array)
            size += bytes.length
            if (size > 65536) {
              res.writeHead(413).end()
              return
            }
            chunks.push(bytes)
          }
          const raw = Buffer.concat(chunks).toString('utf8'),
            body = raw ? JSON.parse(raw) : undefined
          const reply = scenario.handle(req.method ?? 'GET', req.url, body, req.headers)
          res.writeHead(reply.status, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...reply.headers,
          })
          res.end(reply.body === undefined ? undefined : JSON.stringify(reply.body))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify({ code: 'malformed_request' }))
        }
      })
    },
  }
}
