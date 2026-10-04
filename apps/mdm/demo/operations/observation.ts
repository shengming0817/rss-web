import { identifier, uuid } from '../../src/services/decode'
import type { OperationsReference } from '../../src/features/operations/clients/model'
/** Explicit published/candidate resource locators. Unrecognized requests have no invented target. */
export function observationTarget(
  path: string,
  operation: string | null,
): OperationsReference | null {
  if (/^\/api\/v1\/mdm-candidate\/devices\/batch-previews(?:\/|$)/.test(path)) return null
  const mappings: [RegExp, OperationsReference['kind']][] = [
    [/^\/api\/v1\/authorization\/rules\/([^/]+)/, 'authorization_rule'],
    [/^\/api\/v1\/authorization\/user-groups\/([^/]+)/, 'user_group'],
    [/^\/api\/v1\/mdm-candidate\/integrations\/connectors\/([^/]+)/, 'connector'],
    [/^\/api\/(?:v1\/devices|v1\/mdm-candidate\/devices)\/([^/]+)/, 'device'],
    [/^\/api\/(?:v1\/policies|v1\/mdm-candidate\/policies\/assignments)\/([^/]+)/, 'policy'],
    [/^\/api\/v1\/mdm-candidate\/policies\/workflows\/([^/]+)/, 'workflow'],
    [/^\/api\/v1\/mdm-candidate\/software\/self-service\/requests\/([^/]+)/, 'software_request'],
    [/^\/api\/v1\/mdm-candidate\/operations\/reports\/([^/]+)/, 'report'],
    [/^\/api\/v1\/mdm-candidate\/operations\/maintenance\/([^/]+)/, 'job'],
    [/^\/api\/v1\/mdm-candidate\/operations\/alert-rules\/([^/]+)/, 'alert_rule'],
  ]
  for (const [pattern, kind] of mappings) {
    const match = pattern.exec(path)
    if (match)
      try {
        const id = kind === 'device' ? identifier(decodeURIComponent(match[1]!)) : uuid(match[1])
        return { kind, id, device: kind === 'device' ? id : null, revision: null }
      } catch {
        return null
      }
  }
  if (/^\/api\/v1\/mdm-candidate\/operations\/settings(?:\/|$)/.test(path))
    return { kind: 'settings', id: 'configuration', device: null, revision: null }
  if (
    operation &&
    (path === '/api/v1/mdm-candidate/operations/reports' ||
      path === '/api/v1/mdm-candidate/operations/maintenance')
  )
    return {
      kind: path.endsWith('/reports') ? 'report' : 'job',
      id: operation,
      device: null,
      revision: null,
    }
  return null
}
