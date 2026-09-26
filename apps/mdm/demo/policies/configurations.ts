import { configurationApplicability } from './applicability'
import type { DomainHandler } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import type { createScopeDemo } from './scopes'
import {
  configuration,
  configurationFormats,
  settings,
  type Configuration,
  type createConfigurationsClient,
} from '../../src/features/policies/clients/configurations'
import { platforms } from '../../src/features/policies/clients/resources'
import { closed, count, enumeration, identifier, record, uuid } from '../../src/services/decode'
import { createPages, createReceipts, error, operation } from '../http'
import { candidate } from './http'
type Preview = Awaited<ReturnType<ReturnType<typeof createConfigurationsClient>['previewStatus']>>
export function createConfigurationDemo(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  scopes: Pick<ReturnType<typeof createScopeDemo>, 'freeze'>,
  referenced: (id: string, version: number) => boolean,
) {
  const configurations = new Map<string, Configuration>(),
    previews = new Map<string, { value: Preview; revision: number; reads: number }>(),
    receipts = createReceipts(),
    pages = createPages()
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/mdm-candidate\/v1\/policies\/configurations(?:\/([^/]+)(?:\/(diff|previews)(?:\/([^/]+))?)?)?$/.exec(
        request.path,
      )
    if (!match) return
    try {
      if (scenario === 'denied') return error('permission_denied', 403)
      if (!match[1] && request.method === 'GET')
        return candidate(
          pages.page(
            request.path,
            scenario === 'empty' ? [] : [...configurations.values()],
            request.query,
          ),
        )
      const id = uuid(match[1]),
        state = configurations.get(id)
      if (request.method === 'GET') {
        if (!state) return error('resource_not_found', 404)
        if (match[2] === 'diff') {
          const from = count(Number(request.query.get('from'))),
            to = count(Number(request.query.get('to'))),
            a = state.versions.find((v) => v.version === from),
            b = state.versions.find((v) => v.version === to)
          if (!a || !b) return error('resource_not_found', 404)
          const keys = new Set([...a.settings.map((s) => s.key), ...b.settings.map((s) => s.key)])
          const items = [...keys]
            .map((key) => ({
              key,
              before: a.settings.find((s) => s.key === key)?.value ?? null,
              after: b.settings.find((s) => s.key === key)?.value ?? null,
            }))
            .filter((v) => v.before !== v.after)
          return candidate({ configuration: id, from, to, items })
        }
        if (match[2] === 'previews') {
          const task = uuid(match[3]),
            preview = previews.get(task)
          if (!preview || preview.value.configuration !== id)
            return error('operation_not_found', 404)
          if (preview.value.status === 'pending' && preview.reads++ > 0)
            preview.value.status =
              state.revision === preview.revision &&
              scopes.freeze(preview.value.scope)?.revision === preview.value.scopeRevision
                ? 'completed'
                : 'superseded'
          return candidate({ preview: structuredClone(preview.value) })
        }
        return candidate({ configuration: structuredClone(state) })
      }
      if (request.method !== 'POST') return
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (op.expectedRevision !== (state?.revision ?? 0)) return error('operation_conflict')
        if (match[2] === 'previews' && !match[3]) {
          const input = closed(op.input, ['scope', 'version']),
            scope = scopes.freeze(uuid(input['scope'])),
            version = state?.versions.find((v) => v.version === count(input['version']))
          if (!state || !scope || version?.status !== 'published')
            return error('operation_conflict')
          const facts = devices.facts()
          const rows: Preview['rows'] = scope.members.map((device) => {
            const d = facts.find((d) => d.summary.id === device)
            const reason = configurationApplicability(state, version.version, d, [
              ...configurations.values(),
            ])
            return {
              device,
              support:
                reason === 'applicable'
                  ? 'executable'
                  : reason === 'unsupported'
                    ? 'unsupported'
                    : 'blocked',
              reason:
                reason === 'applicable'
                  ? null
                  : reason === 'unsupported'
                    ? 'platform'
                    : reason === 'conflict'
                      ? 'conflict'
                      : 'authorization',
              drift: 'unknown',
              conflicts:
                reason === 'conflict' ? [...configurations.keys()].filter((key) => key !== id) : [],
            }
          })
          previews.set(op.operationId, {
            revision: state.revision,
            reads: 0,
            value: {
              id: op.operationId,
              configuration: id,
              version: version.version,
              scope: scope.id,
              scopeRevision: scope.revision,
              status: 'pending',
              rows,
            },
          })
          return candidate({ task: op.operationId }, 202)
        }
        if (match[2]) return error('malformed_request', 400)
        const input = record(op.input),
          action = enumeration(input['action'], [
            'create',
            'version',
            'publish',
            'archive',
          ] as const)
        let next: Configuration
        if (action === 'create') {
          closed(input, ['action', 'name', 'platform', 'format'])
          if (state) return error('operation_conflict')
          const platform = enumeration(input['platform'], platforms),
            format = enumeration(input['format'], configurationFormats)
          if ((platform === 'windows') !== format.startsWith('windows_'))
            return error('malformed_request', 400)
          next = {
            id,
            revision: 1,
            name: identifier(input['name']),
            platform,
            format,
            versions: [],
          }
        } else {
          if (!state) return error('resource_not_found', 404)
          next = structuredClone(state)
          if (action === 'version') {
            closed(input, ['action', 'settings'])
            next.versions.push({
              version: next.versions.length + 1,
              status: 'draft',
              settings: settings(input['settings']),
            })
          } else {
            closed(input, ['action', 'version'])
            const version = next.versions.find((v) => v.version === count(input['version']))
            if (
              !version ||
              version.status === 'archived' ||
              (action === 'publish' && version.status !== 'draft') ||
              (action === 'archive' && referenced(id, version.version))
            )
              return error('operation_conflict')
            version.status = action === 'publish' ? 'published' : 'archived'
          }
          next.revision++
        }
        configurations.set(id, configuration(next, id))
        return candidate({ configuration: next })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    assess(id: string, version: number, device: string) {
      const c = configurations.get(id)
      return c
        ? configurationApplicability(
            c,
            version,
            devices.facts().find((d) => d.summary.id === device),
            [...configurations.values()],
          )
        : ('resource_unavailable' as const)
    },
    read: (id: string) => {
      const value = configurations.get(id)
      return value ? structuredClone(value) : null
    },
    reset() {
      configurations.clear()
      previews.clear()
      receipts.reset()
      pages.reset()
    },
  }
}
