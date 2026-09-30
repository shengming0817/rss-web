import { identifier, uuid } from '../../src/services/decode'
import type { OperationsReference } from '../../src/features/operations/clients/model'
/** Explicit published/candidate resource locators. Unrecognized requests have no invented target. */
export function observationTarget(
  path: string,
  operation: string | null,
): OperationsReference | null {
  if (/^\/api\/mdm-candidate\/v1\/devices\/batch-previews(?:\/|$)/.test(path)) return null
  const mappings: [RegExp, OperationsReference['kind']][] = [
    [/^\/api\/v1\/authorization\/rules\/([^/]+)/, 'authorization_rule'],
    [/^\/api\/v1\/authorization\/user-groups\/([^/]+)/, 'user_group'],
    [/^\/api\/mdm-candidate\/v1\/integrations\/connectors\/([^/]+)/, 'connector'],
    [/^\/api\/(?:v[23]\/devices|mdm-candidate\/v1\/devices)\/([^/]+)/, 'device'],
    [/^\/api\/(?:v2\/policies|mdm-candidate\/v1\/policies\/assignments)\/([^/]+)/, 'policy'],
    [/^\/api\/mdm-candidate\/v1\/policies\/workflows\/([^/]+)/, 'workflow'],
    [/^\/api\/mdm-candidate\/v1\/software\/self-service\/requests\/([^/]+)/, 'software_request'],
    [/^\/api\/mdm-candidate\/v1\/operations\/reports\/([^/]+)/, 'report'],
    [/^\/api\/mdm-candidate\/v1\/operations\/maintenance\/([^/]+)/, 'job'],
    [/^\/api\/mdm-candidate\/v1\/operations\/alert-rules\/([^/]+)/, 'alert_rule'],
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
  if (/^\/api\/mdm-candidate\/v1\/operations\/settings(?:\/|$)/.test(path))
    return { kind: 'settings', id: 'configuration', device: null, revision: null }
  if (
    operation &&
    (path === '/api/mdm-candidate/v1/operations/reports' ||
      path === '/api/mdm-candidate/v1/operations/maintenance')
  )
    return {
      kind: path.endsWith('/reports') ? 'report' : 'job',
      id: operation,
      device: null,
      revision: null,
    }
  return null
}
