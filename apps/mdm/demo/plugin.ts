import { seedTelemetry } from './telemetry-seed'
import { createSettingsDemo } from './settings'
import { createOnboardingDemo } from './enrollment'
import type { Plugin } from 'vite'
import { mdmJsonBodyLimit, MDM_CONTENT_BODY_LIMIT, isMdmContentRequest } from '@rss/api/mdm-limits'
import { createScenario } from './scenario'
import { createDeviceDemo } from './devices/state'
import { createAutomationDemo } from './policies/state'
import { seedScriptPolicies } from './policies/seed'
import { createImportsDemo } from './software/imports'
import { createSoftwareAssetsDemo } from './software-assets/state'
import { createDemoGroups } from './features/groups/state'
export function demoPlugin(): Plugin {
  return {
    name: 'mdm-http-demo',
    transformIndexHtml(html) {
      return html.replace('/src/main.ts', '/demo/main.ts')
    },
    configureServer(server) {
      const settings = createSettingsDemo({ seedDownloads: true })
      const devices = createDeviceDemo()
      const automation = createAutomationDemo(devices)
      devices.bindAuthorization(automation.authorization.can)
      seedScriptPolicies(automation)
      seedTelemetry(automation)
      const onboarding = createOnboardingDemo(
        automation.authorization.can,
        devices.registrationAllowed,
      )
      const software = automation.lifecycle
      const publication = automation.publication
      const imports = createImportsDemo(automation.resources, software)
      const softwareAssets = createSoftwareAssetsDemo()
      const demoGroups = createDemoGroups()
      const scenario = createScenario(
        [
          (request) => automation.authorization.guard(request),
          settings.handle,
          onboarding.handle,
          publication.handle,
          imports.handle,
          softwareAssets.handle,
          demoGroups.handle,
          automation.handle,
          devices.handle,
        ],
        () => {
          settings.reset()
          onboarding.reset()
          devices.reset()
          automation.reset()
          imports.reset()
          softwareAssets.reset()
          demoGroups.reset()
          seedScriptPolicies(automation)
          seedTelemetry(automation)
        },
        (event, scenario) => {
          if (event.kind === 'clock') onboarding.tick()
          devices.tick(event)
          const accepted = automation.tick(event, scenario)
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
