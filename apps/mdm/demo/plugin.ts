import { createOnboardingDemo } from './enrollment'
import type { Plugin } from 'vite'
import { mdmJsonBodyLimit, MDM_CONTENT_BODY_LIMIT, isMdmContentRequest } from '@rss/api/mdm-limits'
import { createScenario } from './scenario'
import { createDeviceDemo } from './devices/state'
import { createAutomationDemo } from './policies/state'
import { seedScriptPolicies } from './policies/seed'
import { createPublicationDemo } from './software/publication'
import { createCatalogDemo } from './software/catalog'
import { createImportsDemo } from './software/imports'
export function demoPlugin(): Plugin {
  return {
    name: 'mdm-http-demo',
    transformIndexHtml(html) {
      return html.replace('/src/main.ts', '/demo/main.ts')
    },
    configureServer(server) {
      const devices = createDeviceDemo()
      const automation = createAutomationDemo(devices)
      seedScriptPolicies(automation)
      const onboarding = createOnboardingDemo(automation.authorization.can)
      const software = automation.admission
      const publication = createPublicationDemo(automation.resources)
      const imports = createImportsDemo(automation.resources, software)
      const catalog = createCatalogDemo(automation.resources, software, publication, () =>
        devices.facts().map((d) => d.summary.id),
      )
      const scenario = createScenario(
        [
          onboarding.handle,
          publication.handle,
          catalog.handle,
          imports.handle,
          automation.handle,
          devices.handle,
        ],
        () => {
          onboarding.reset()
          devices.reset()
          automation.reset()
          publication.reset()
          catalog.reset()
          imports.reset()
          seedScriptPolicies(automation)
        },
        (event, scenario) => {
          if (event.kind === 'clock') onboarding.tick()
          devices.tick(event)
          const accepted = automation.tick(event, scenario)
          catalog.tick(event)
          return accepted
        },
        automation.observe,
        automation.now,
      )
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next()
          return
        }
        try {
          const path = new URL(req.url, 'http://demo.invalid').pathname
          const content = isMdmContentRequest(req.method ?? 'GET', path)
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of req) {
            const bytes = Buffer.from(chunk as Uint8Array)
            size += bytes.length
            if (
              size >
              (content ? MDM_CONTENT_BODY_LIMIT : mdmJsonBodyLimit(req.method ?? 'GET', path))
            ) {
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
            ...reply.headers,
          })
          res.end(
            reply.body instanceof ArrayBuffer
              ? Buffer.from(reply.body)
              : reply.body === undefined
                ? undefined
                : JSON.stringify(reply.body),
          )
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ code: 'malformed_request' }))
        }
      })
    },
  }
}
