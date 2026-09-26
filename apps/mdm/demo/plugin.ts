import type { Plugin } from 'vite'
import { MDM_JSON_BODY_LIMIT, MDM_CONTENT_BODY_LIMIT, isMdmContentPath } from '@rss/api/mdm-limits'
import { createScenario } from './scenario'
import { createDeviceDemo } from './devices/state'
import { createAutomationDemo } from './policies/state'
export function demoPlugin(): Plugin {
  return {
    name: 'mdm-http-demo',
    transformIndexHtml(html) {
      return html.replace('/src/main.ts', '/demo/main.ts')
    },
    configureServer(server) {
      const devices = createDeviceDemo()
      const automation = createAutomationDemo(devices)
      const scenario = createScenario(
        [automation.handle, devices.handle],
        () => {
          devices.reset()
          automation.reset()
        },
        automation.tick,
        automation.observe,
      )
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next()
          return
        }
        try {
          const content =
            req.method === 'POST' &&
            isMdmContentPath(new URL(req.url, 'http://demo.invalid').pathname)
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of req) {
            const bytes = Buffer.from(chunk as Uint8Array)
            size += bytes.length
            if (size > (content ? MDM_CONTENT_BODY_LIMIT : MDM_JSON_BODY_LIMIT)) {
              res.writeHead(413).end()
              return
            }
            chunks.push(bytes)
          }
          const raw = Buffer.concat(chunks)
          const body = content
            ? Uint8Array.from(raw).buffer
            : raw.length
              ? JSON.parse(raw.toString('utf8'))
              : undefined
          const reply = await scenario.handle(req.method ?? 'GET', req.url, body, req.headers)
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
