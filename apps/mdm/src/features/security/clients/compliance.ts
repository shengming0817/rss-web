import * as api from '@rss/api/mdm-operations'
import { queryParameters, projectedPage, type DirectoryQuery } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  boolean,
  enumeration,
  closed,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import {
  complianceHistory,
  complianceDefinition,
  complianceRule,
  complianceTask,
  currentCompliance,
  positive,
  type ComplianceDefinition,
} from './compliance-model'
const ruleFields = {
  id: uuid,
  revision: positive,
  name: (v: unknown) => nullable(v, string),
  enabled: (v: unknown) => nullable(v, boolean),
  deleted: boolean,
  severity: (v: unknown) =>
    nullable(v, (x) => enumeration(x, ['low', 'medium', 'high', 'critical'] as const)),
  platform: (v: unknown) =>
    nullable(v, (x) => enumeration(x, ['all', 'windows', 'macos'] as const)),
  targetKind: (v: unknown) => nullable(v, (x) => enumeration(x, ['all', 'groups'] as const)),
  definition: (v: unknown) => nullable(v, complianceDefinition),
}
export type HistoryFilter = { cursor?: string; from?: number; until?: number; limit?: number }
/** Published rss-mdm v2 wire: no candidate envelope and distinct rule/history pagination. */
export function createComplianceClient(transport: HttpTransport) {
  return {
    list: <F extends keyof typeof ruleFields = keyof typeof ruleFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1ComplianceRules(
        transport,
        {
          query: queryParameters({
            limit: 20,
            ...query,
          }),
        },
        (value) => projectedPage(value, ruleFields, query.fields, ['id']),
      ),
    read: (id: string) =>
      api.getApiV1ComplianceRulesById(transport, { pathParams: { id } }, (v) =>
        complianceRule(v, id),
      ),
    version: (id: string, revision: number) =>
      api.getApiV1ComplianceRulesByIdVersionsByRevision(
        transport,
        { pathParams: { id, revision } },
        (v) => complianceRule(v, id, revision),
      ),
    put: (id: string, body: Operation<ComplianceDefinition>) =>
      api.putApiV1ComplianceRulesById(transport, { pathParams: { id }, body }, (value) => {
        const v = closed(value, ['id', 'revision', 'task'])
        if (uuid(v['id']) !== id || positive(v['revision']) !== body.expectedRevision + 1)
          throw new Error('Wrong compliance write')
        const task = nullable(v['task'], uuid)
        if (body.input.enabled !== (task !== null)) throw new Error('Wrong compliance evaluation')
        return { id, revision: body.expectedRevision + 1, task }
      }),
    recompute: (id: string, body: Operation<Record<string, never>>) =>
      api.postApiV1ComplianceRulesByIdRecompute(transport, { pathParams: { id }, body }, (v) => ({
        task: uuid(closed(v, ['task'])['task']),
      })),
    task: (id: string, task: string) =>
      api.getApiV1ComplianceRulesByIdTasksByTask(transport, { pathParams: { id, task } }, (v) =>
        complianceTask(v, id, task),
      ),
    current: (device: string) =>
      api.getApiV1DevicesByIdCompliance(transport, { pathParams: { id: device } }, (v) =>
        currentCompliance(v, device),
      ),
    history: (device: string, query: HistoryFilter = {}) =>
      api.getApiV1DevicesByIdComplianceHistory(
        transport,
        { pathParams: { id: device }, query },
        (value) => {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: unique(array(v['items'], complianceHistory), (v) => v.task),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      ),
  }
}
