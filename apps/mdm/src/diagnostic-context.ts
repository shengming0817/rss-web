import type { DiagnosticQuery, DiagnosticsContext, OperationAddress } from '@rss/mdm-audit'
import { validateDiagnosticQuery, validateOperationAddress } from '@rss/mdm-audit'
import { uuid } from '@rss/mdm-inventory'

export type DiagnosticSelection =
  | { mode: 'discover'; query: DiagnosticQuery }
  | { mode: 'request'; id: string }
  | { mode: 'operation'; address: OperationAddress }

const discovery = [
  'targetType',
  'targetId',
  'device',
  'actor',
  'from',
  'until',
  'operationId',
] as const
const coordinates = ['actor', 'instance', 'device', 'target'] as const

function fields(params: URLSearchParams, keys: readonly string[]) {
  return Object.fromEntries(
    keys.flatMap<[string, string | number]>((key) => {
      const value = params.get(key)
      if (value === null || value === '') return []
      if (['from', 'until'].includes(key)) {
        if (!/^\d+$/.test(value)) throw new Error('Invalid numeric coordinate')
        return [[key, Number(value)]]
      }
      return [[key, value]]
    }),
  )
}

export function readDiagnosticSelection(params: URLSearchParams): DiagnosticSelection | null {
  switch (params.get('mode')) {
    case null:
      return null
    case 'discover': {
      const query = fields(params, discovery) as DiagnosticQuery
      validateDiagnosticQuery(query)
      return { mode: 'discover', query }
    }
    case 'request':
      return { mode: 'request', id: uuid(params.get('requestId') ?? '') }
    case 'operation': {
      const address = {
        owner: params.get('owner') ?? '',
        operationId: params.get('operationId') ?? '',
        ...fields(params, coordinates),
      }
      validateOperationAddress(address)
      return { mode: 'operation', address }
    }
    default:
      throw new Error('Invalid lookup mode')
  }
}

export function diagnosticsPath(
  context: DiagnosticsContext,
  selection?: DiagnosticSelection,
): string {
  const params = new URLSearchParams()
  if (context === 'da') params.set('context', 'da')
  if (selection) {
    params.set('mode', selection.mode)
    if (selection.mode === 'request') params.set('requestId', uuid(selection.id))
    else {
      const source = selection.mode === 'discover' ? selection.query : selection.address
      const keys =
        selection.mode === 'discover' ? discovery : ['owner', 'operationId', ...coordinates]
      for (const key of keys) {
        const value: unknown = Reflect.get(source, key)
        if (typeof value === 'string' || typeof value === 'number') params.set(key, String(value))
      }
      readDiagnosticSelection(params)
    }
  }
  return `${context === 'management' ? '/platform' : ''}/operation-diagnostics${params.size ? '?' + params : ''}`
}
