import { authorization, reauthorizationEligibility } from './authorization'
import { queryParameters, projectedPage, type DirectoryQuery } from '@rss/api/mdm-query'
import { jsonValue } from '../../../services/json'
import type { HttpTransport } from '@rss/api/mdm'
import {
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  uuid,
} from '../../../services/decode'
import { decodeRunEvidence } from './runs'
import { decodeNativeObservation } from './native'

const executionFields = {
  id: uuid,
  kind: (v: unknown) => enumeration(v, ['command', 'action_run'] as const),
  device: identifier,
  policy: (v: unknown) => nullable(v, uuid),
  registrationId: uuid,
  generation: count,
  origin: (v: unknown) => enumeration(v, ['direct', 'policy'] as const),
  deadline: integer,
  authorization,
  reauthorization: reauthorizationEligibility,
  status: identifier,
  detailUrl: (v: unknown) => {
    const path = string(v)
    if (
      !/^\/api\/v1\/(?:devices\/[^/?#]+\/operations|policies\/[0-9a-f-]{36}\/runs)\/[0-9a-f-]{36}$/.test(
        path,
      )
    )
      throw new Error('Invalid operation locator')
    return path
  },
  evidence: (v: unknown) => {
    if (!('commandStatus' in record(v))) return decodeRunEvidence(v)
    const raw = closed(
      v,
      ['commandStatus', 'observation', 'dispatchFailure'],
      ['agentInstallation'],
    )
    return {
      kind: 'command' as const,
      commandStatus: identifier(raw['commandStatus']),
      observation: decodeNativeObservation(raw['observation']),
      dispatchFailure: nullable(raw['dispatchFailure'], (v) => jsonValue(v, 16384)),
      ...('agentInstallation' in raw
        ? { agentInstallation: jsonValue(raw['agentInstallation'], 65536) }
        : {}),
    }
  },
}
export function createExecutionsClient(transport: HttpTransport) {
  return {
    directory: <F extends keyof typeof executionFields = keyof typeof executionFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/operations',
        query: queryParameters({ limit: 20, ...query }),
        successStatus: 200,
        decode(value) {
          const page = projectedPage(value, executionFields, query.fields, ['id', 'kind'])
          for (const row of page.items) {
            if (
              'kind' in row &&
              'evidence' in row &&
              (row.evidence as ReturnType<typeof executionFields.evidence>).kind !== row.kind
            )
              throw new Error('Wrong operation evidence')
            if (
              'id' in row &&
              'kind' in row &&
              'device' in row &&
              'policy' in row &&
              'detailUrl' in row
            ) {
              const expected =
                row.kind === 'command'
                  ? `/api/v1/devices/${new URLSearchParams({ id: String(row.device) }).toString().slice(3).replaceAll('+', '%20')}/operations/${row.id}`
                  : `/api/v1/policies/${row.policy}/runs/${row.id}`
              if ((row.kind === 'action_run' && row.policy === null) || row.detailUrl !== expected)
                throw new Error('Wrong operation locator')
            }
          }
          return page
        },
      }),
    statistics: (filter?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/operations/statistics',
        query: queryParameters({ filter }),
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['statistics', 'asOf']),
            stats = closed(v['statistics'], ['total', 'commands', 'actionRuns', 'unknown'])
          return {
            statistics: {
              total: count(stats['total']),
              commands: count(stats['commands']),
              actionRuns: count(stats['actionRuns']),
              unknown: count(stats['unknown']),
            },
            asOf: integer(v['asOf']),
          }
        },
      }),
  }
}
