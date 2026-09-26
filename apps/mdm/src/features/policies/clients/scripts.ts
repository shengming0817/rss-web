import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import {
  architectures,
  decodeScriptSpec,
  digest,
  jsonValue,
  platforms,
  type Architecture,
  type Json,
  type Platform,
} from './resources'
export type Trigger =
  | { kind: 'manual' | 'registration' }
  | { kind: 'once'; at: number }
  | { kind: 'interval'; anchor: number; seconds: number }
  | { kind: 'weekly'; zone: string; weekday: number; minute: number }
  | { kind: 'check_in'; minimumSeconds: number }
export interface Schedule {
  trigger: Trigger
  misfire: 'skip' | 'coalesce_one'
  notBefore: number
  until: number
  jitterSeconds: number
  window: null | { zone: string; weekdays: number[]; startMinute: number; endMinute: number }
}
export interface ScriptCreate {
  operationId: string
  resource: string
  version: string
  platform: Platform
  architecture: Architecture
  variant: string
  parameters: Json
  devices: string[]
  schedule: Schedule
  runLifetimeSeconds: number
}
function trigger(value: unknown): Trigger {
  const kind = enumeration(record(value)['kind'], [
    'manual',
    'registration',
    'once',
    'interval',
    'weekly',
    'check_in',
  ] as const)
  if (kind === 'manual' || kind === 'registration') {
    closed(value, ['kind'])
    return { kind }
  }
  if (kind === 'once') {
    const v = closed(value, ['kind', 'at'])
    return { kind, at: count(v['at']) }
  }
  if (kind === 'interval') {
    const v = closed(value, ['kind', 'anchor', 'seconds'])
    return { kind, anchor: count(v['anchor']), seconds: count(v['seconds']) }
  }
  if (kind === 'check_in') {
    const v = closed(value, ['kind', 'minimumSeconds'])
    return { kind, minimumSeconds: count(v['minimumSeconds']) }
  }
  const v = closed(value, ['kind', 'zone', 'weekday', 'minute'])
  return {
    kind,
    zone: identifier(v['zone']),
    weekday: count(v['weekday']),
    minute: count(v['minute']),
  }
}
export function decodeSchedule(value: unknown): Schedule {
  const v = closed(value, ['trigger', 'misfire', 'notBefore', 'until', 'jitterSeconds', 'window'])
  return {
    trigger: trigger(v['trigger']),
    misfire: enumeration(v['misfire'], ['skip', 'coalesce_one'] as const),
    notBefore: count(v['notBefore']),
    until: count(v['until']),
    jitterSeconds: count(v['jitterSeconds']),
    window: nullable(v['window'], (value) => {
      const w = closed(value, ['zone', 'weekdays', 'startMinute', 'endMinute'])
      return {
        zone: identifier(w['zone']),
        weekdays: unique(array(w['weekdays'], count), (v) => v),
        startMinute: count(w['startMinute']),
        endMinute: count(w['endMinute']),
      }
    }),
  }
}
function input(value: unknown): ScriptCreate {
  const v = closed(value, [
    'operationId',
    'resource',
    'version',
    'platform',
    'architecture',
    'variant',
    'parameters',
    'devices',
    'schedule',
    'runLifetimeSeconds',
  ])
  return {
    operationId: uuid(v['operationId']),
    resource: identifier(v['resource']),
    version: identifier(v['version']),
    platform: enumeration(v['platform'], platforms),
    architecture: enumeration(v['architecture'], architectures),
    variant: identifier(v['variant']),
    parameters: jsonValue(v['parameters'], 65_536),
    devices: unique(array(v['devices'], identifier), (v) => v),
    schedule: decodeSchedule(v['schedule']),
    runLifetimeSeconds: count(v['runLifetimeSeconds']),
  }
}
export function decodeScriptPlan(value: unknown, id: string) {
  const v = closed(value, ['planId', 'revision', 'active', 'approved', 'definition', 'runsUrl'])
  if (
    uuid(v['planId']) !== id ||
    v['revision'] !== 1 ||
    v['runsUrl'] !== `/api/v3/script-plans/${id}/runs`
  )
    throw new Error('Wrong script plan')
  const f = closed(v['definition'], [
    'input',
    'definition',
    'resourceDigest',
    'artifactReference',
    'content',
  ])
  const c = closed(f['content'], ['length', 'sha256'])
  return {
    planId: id,
    revision: 1,
    active: boolean(v['active']),
    approved: boolean(v['approved']),
    definition: {
      input: input(f['input']),
      definition: decodeScriptSpec(f['definition']),
      resourceDigest: digest(f['resourceDigest']),
      artifactReference: identifier(f['artifactReference']),
      content: { length: count(c['length']), sha256: digest(c['sha256']) },
    },
    runsUrl: string(v['runsUrl']),
  }
}
export type ScriptPlan = ReturnType<typeof decodeScriptPlan>
function runState(value: unknown) {
  const v = closed(value, ['delivery', 'execution', 'cancellation', 'deadline', 'startedAt'])
  const kind = enumeration(record(v['delivery'])['kind'], [
    'queued',
    'claimed',
    'received',
  ] as const)
  const d = closed(v['delivery'], kind === 'queued' ? ['kind'] : ['kind', 'attempt', 'leaseUntil'])
  const delivery =
    kind === 'queued'
      ? { kind }
      : { kind, attempt: uuid(d['attempt']), leaseUntil: count(d['leaseUntil']) }
  return {
    delivery,
    execution: enumeration(v['execution'], [
      'not_started',
      'running',
      'succeeded',
      'failed',
      'unknown',
    ] as const),
    cancellation: enumeration(v['cancellation'], ['none', 'requested', 'confirmed'] as const),
    deadline: count(v['deadline']),
    startedAt: nullable(v['startedAt'], count),
  }
}
function text(value: unknown) {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > 16_384)
    throw new Error('Invalid diagnostics')
  return value
}
function result(value: unknown, detail: boolean) {
  const v = closed(value, [
    'exitCode',
    'quality',
    'schemaValid',
    'trusted',
    'diagnostics',
    ...(detail ? ['output'] : []),
  ])
  const d = closed(v['diagnostics'], [
    'durationMs',
    'executedAt',
    'failure',
    ...(detail ? ['stdout', 'stderr'] : []),
  ])
  return {
    exitCode: nullable(v['exitCode'], integer),
    quality: enumeration(v['quality'], ['complete', 'failed', 'truncated', 'partial'] as const),
    schemaValid: boolean(v['schemaValid']),
    trusted: boolean(v['trusted']),
    ...(detail ? { output: jsonValue(v['output'], 1_048_576) } : {}),
    diagnostics: {
      durationMs: count(d['durationMs']),
      executedAt: count(d['executedAt']),
      failure: nullable(d['failure'], (value) =>
        enumeration(value, [
          'launch_failed',
          'timed_out',
          'cancelled',
          'non_zero_exit',
          'output_limit',
          'capture_failed',
        ] as const),
      ),
      ...(detail ? { stdout: text(d['stdout']), stderr: text(d['stderr']) } : {}),
    },
  }
}
function run(value: unknown, detail: boolean) {
  const v = closed(value, [
    'taskId',
    'device',
    'registrationId',
    'generation',
    'availableAt',
    'deadline',
    'state',
    'effect',
    'result',
    detail ? 'planId' : 'occurrence',
  ])
  return {
    taskId: uuid(v['taskId']),
    device: identifier(v['device']),
    registrationId: uuid(v['registrationId']),
    generation: count(v['generation']),
    availableAt: count(v['availableAt']),
    deadline: count(v['deadline']),
    state: runState(v['state']),
    effect: enumeration(v['effect'], ['unverified'] as const),
    result: nullable(v['result'], (v) => result(v, detail)),
    ...(detail ? { planId: uuid(v['planId']) } : { occurrence: count(v['occurrence']) }),
  }
}
export function decodeRun(value: unknown, plan: string, task: string) {
  const v = run(value, true)
  if (!('planId' in v) || v.planId !== plan || v.taskId !== task) throw new Error('Wrong run')
  return v
}
export interface RunCursor {
  availableAt: number
  taskId: string
}
export function decodeRunPage(value: unknown) {
  const v = closed(value, ['items', 'nextCursor'])
  return {
    items: unique(
      array(v['items'], (v) => run(v, false)),
      (v) => v.taskId,
    ),
    nextCursor: nullable(v['nextCursor'], (value) => {
      const c = closed(value, ['availableAt', 'taskId'])
      return { availableAt: count(c['availableAt']), taskId: uuid(c['taskId']) }
    }),
  }
}
export type ScriptRun = ReturnType<typeof decodeRun>
export function createScriptsClient(transport: HttpTransport) {
  return {
    create: (body: ScriptCreate) =>
      transport.request({
        method: 'POST',
        path: '/api/v3/script-plans',
        body,
        successStatus: 202,
        decode(value) {
          const v = closed(value, [
            'operationId',
            'planId',
            'revision',
            'authorization',
            'targetCount',
            'nextStage',
          ])
          if (
            uuid(v['operationId']) !== body.operationId ||
            v['revision'] !== 1 ||
            v['authorization'] !== 'pending_review' ||
            v['nextStage'] !== 'review'
          )
            throw new Error('Wrong script receipt')
          return {
            operationId: body.operationId,
            planId: uuid(v['planId']),
            revision: 1,
            authorization: 'pending_review' as const,
            targetCount: count(v['targetCount']),
            nextStage: 'review' as const,
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v3/script-plans/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decodeScriptPlan(v, id),
      }),
    approve: (id: string, operationId: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v3/script-plans/{id}/approve',
        pathParams: { id },
        body: { operationId },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['planId', 'revision', 'authorization'])
          if (uuid(v['planId']) !== id || v['revision'] !== 1 || v['authorization'] !== 'approved')
            throw new Error('Wrong approval')
          return { planId: id, revision: 1, authorization: 'approved' as const }
        },
      }),
    cancel: (id: string, operationId: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v3/script-plans/{id}/cancel',
        pathParams: { id },
        body: { operationId },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['planId', 'cancelRequested'])
          if (uuid(v['planId']) !== id || v['cancelRequested'] !== true)
            throw new Error('Wrong cancellation')
          return { planId: id, cancelRequested: true as const }
        },
      }),
    runs: (id: string, cursor?: RunCursor) =>
      transport.request({
        method: 'GET',
        path: '/api/v3/script-plans/{id}/runs',
        pathParams: { id },
        query: { afterAt: cursor?.availableAt, afterId: cursor?.taskId },
        successStatus: 200,
        decode: decodeRunPage,
      }),
    run: (id: string, task: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v3/script-plans/{id}/runs/{task}',
        pathParams: { id, task },
        successStatus: 200,
        decode: (v) => decodeRun(v, id, task),
      }),
  }
}
