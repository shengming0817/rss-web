import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { criteria, fieldKey, type Criteria } from '../../devices/clients/asset-model'
import { decodeSchedule, type Schedule } from './schedule'
import { jsonValue, type Json } from './resources'
import { candidate } from './candidate'
export type WorkflowAction =
  | { kind: 'approval' }
  | { kind: 'configuration'; configuration: string; version: number }
  | {
      kind: 'script' | 'repair'
      resource: string
      version: string
      variant: string
      parameters: Json
    }
  | { kind: 'query'; sql: string; mappings: { field: string; pointer: string }[] }
export interface WorkflowStep {
  id: string
  name: string
  action: WorkflowAction
  condition: Criteria | null
  onFailure: 'stop' | 'continue' | 'approval'
}
export interface WorkflowDefinition {
  name: string
  scope: string
  schedule: Schedule
  steps: WorkflowStep[]
}
function action(value: unknown): WorkflowAction {
  const kind = enumeration(record(value)['kind'], [
    'approval',
    'configuration',
    'script',
    'query',
    'repair',
  ] as const)
  if (kind === 'approval') {
    closed(value, ['kind'])
    return { kind }
  }
  if (kind === 'configuration') {
    const v = closed(value, ['kind', 'configuration', 'version'])
    return { kind, configuration: uuid(v['configuration']), version: count(v['version']) }
  }
  if (kind === 'query') {
    const v = closed(value, ['kind', 'sql', 'mappings'])
    const sql = jsonValue(v['sql'], 8192)
    if (typeof sql !== 'string' || !sql.trim()) throw new Error('Invalid query text')
    return {
      kind,
      sql,
      mappings: unique(
        array(v['mappings'], (value) => {
          const m = closed(value, ['field', 'pointer'])
          return { field: fieldKey(m['field']), pointer: identifier(m['pointer']) }
        }),
        (m) => m.field,
      ),
    }
  }
  const v = closed(value, ['kind', 'resource', 'version', 'variant', 'parameters'])
  return {
    kind,
    resource: identifier(v['resource']),
    version: identifier(v['version']),
    variant: identifier(v['variant']),
    parameters: jsonValue(v['parameters'], 8192),
  }
}
export function workflowDefinition(value: unknown): WorkflowDefinition {
  const v = closed(value, ['name', 'scope', 'schedule', 'steps'])
  const steps = unique(
    array(v['steps'], (value) => {
      const s = closed(value, ['id', 'name', 'action', 'condition', 'onFailure'])
      return {
        id: uuid(s['id']),
        name: identifier(s['name']),
        action: action(s['action']),
        condition: nullable(s['condition'], criteria),
        onFailure: enumeration(s['onFailure'], ['stop', 'continue', 'approval'] as const),
      }
    }),
    (s) => s.id,
  )
  if (!steps.length || steps.length > 20) throw new Error('Invalid step count')
  return {
    name: identifier(v['name']),
    scope: uuid(v['scope']),
    schedule: decodeSchedule(v['schedule']),
    steps,
  }
}
export function workflow(value: unknown, id: string) {
  const v = closed(value, ['id', 'revision', 'version', 'status', 'definition'])
  if (uuid(v['id']) !== id) throw new Error('Wrong workflow')
  return {
    id,
    revision: count(v['revision']),
    version: count(v['version']),
    status: enumeration(v['status'], ['active', 'archived'] as const),
    definition: workflowDefinition(v['definition']),
  }
}
export type Workflow = ReturnType<typeof workflow>
export type WorkflowChange =
  | { action: 'put'; definition: WorkflowDefinition }
  | { action: 'archive' }
export function workflowRun(value: unknown, workflow: string, id?: string) {
  const v = closed(value, [
    'id',
    'workflow',
    'revision',
    'version',
    'author',
    'approval',
    'state',
    'definition',
    'scopeRevision',
    'targets',
    'executions',
  ])
  if (v['workflow'] !== workflow || (id !== undefined && v['id'] !== id))
    throw new Error('Wrong workflow run')
  return {
    id: uuid(v['id']),
    workflow,
    revision: count(v['revision']),
    version: count(v['version']),
    author: uuid(v['author']),
    approval: enumeration(v['approval'], ['pending', 'approved', 'blocked'] as const),
    state: enumeration(v['state'], [
      'waiting',
      'running',
      'completed',
      'partial',
      'unknown',
      'cancel_requested',
      'cancelled',
    ] as const),
    definition: workflowDefinition(v['definition']),
    scopeRevision: count(v['scopeRevision']),
    targets: unique(array(v['targets'], identifier), (v) => v),
    executions: unique(array(v['executions'], uuid), (v) => v),
  }
}
export type WorkflowRun = ReturnType<typeof workflowRun>
export function createWorkflowsClient(transport: HttpTransport, tenant: string, demo: boolean) {
  const read = (v: unknown, id: string) =>
    workflow(candidate(v, tenant, demo, ['workflow'])['workflow'], id)
  const run = (v: unknown, id: string, task?: string) =>
    workflowRun(candidate(v, tenant, demo, ['run'])['run'], id, task)
  return {
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/policies/workflows/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => read(v, id),
      }),
    change: (id: string, body: Operation<WorkflowChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/policies/workflows/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => read(v, id),
      }),
    start: (id: string, body: Operation<Record<string, never>>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/policies/workflows/{id}/runs',
        pathParams: { id },
        body,
        successStatus: 202,
        decode: (v) => run(v, id),
      }),
    run: (id: string, task: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/policies/workflows/{id}/runs/{task}',
        pathParams: { id, task },
        successStatus: 200,
        decode: (v) => run(v, id, task),
      }),
    runs: (id: string, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/policies/workflows/{id}/runs',
        pathParams: { id },
        query: { limit: 20, cursor },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['snapshot', 'items', 'nextCursor'])
          return {
            snapshot: uuid(v['snapshot']),
            items: array(v['items'], (v) => workflowRun(v, id)),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    changeRun: (
      id: string,
      task: string,
      action: 'approve' | 'cancel' | 'reapprove',
      body: Operation<Record<string, never>>,
    ) =>
      transport.request({
        method: 'POST',
        path: `/api/mdm-candidate/v1/policies/workflows/{id}/runs/{task}/${action}`,
        pathParams: { id, task },
        body,
        successStatus: 200,
        decode: (v) => run(v, id, task),
      }),
  }
}
