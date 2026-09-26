import { createHash, randomUUID } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import type { createScopeDemo } from './scopes'
import type { createResourceDemo } from './resources'
import type { createNativeDemo } from './native'
import type { FrozenNativeTask } from '../../src/features/policies/clients/native'
import type { PolicyRead } from '../../src/features/policies/clients/policies'
import { closed, count, enumeration, identifier, record, uuid } from '../../src/services/decode'
import { createPages, createReceipts, error, ok, operation } from '../http'
type Scope = NonNullable<ReturnType<ReturnType<typeof createScopeDemo>['freeze']>>
interface Policy {
  read: PolicyRead
  resource: string | null
  resourceVersion: string | null
  version: number
  saved: string | null
}
type History = ReturnType<ReturnType<typeof createNativeDemo>['policyRecords']>
type Intent =
  | { kind: 'add' | 'supersede'; device: string; version: number }
  | { kind: 'retain' | 'cancel'; execution: History[number]['execution']; reason: string }
  | { kind: 'predecessor'; execution: History[number]['execution']; successor_version: number }
interface Preview {
  history: History
  intents: Intent[]
  policy: string
  revision: number
  scope: Scope
  resourceDigest: number[]
  enabled: boolean
  version: number
  plan: string
  admission: string
  capabilities: string
  reads: number
  status: 'running' | 'completed' | 'failed' | 'superseded'
  failure: 'capability_unknown' | 'platform_unsupported' | 'stale_plan' | null
  failedDevice: string | null
  executed: boolean
}
export function createPolicyDemo(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  scopes: Pick<ReturnType<typeof createScopeDemo>, 'freeze'>,
  resources: Pick<ReturnType<typeof createResourceDemo>, 'read'>,
  native: Pick<
    ReturnType<typeof createNativeDemo>,
    'admit' | 'validateAdmission' | 'policyRecords' | 'cancelPolicy'
  >,
) {
  const policies = new Map<string, Policy>(),
    previews = new Map<string, Preview>(),
    receipts = createReceipts(),
    pages = createPages()
  function capability(members: string[]) {
    const facts = devices.facts()
    return JSON.stringify(
      members.map((id) => {
        const d = facts.find((d) => d.summary.id === id)
        return {
          id,
          revision: d?.summary.revision,
          platform: d?.summary.platform,
          channels: d?.summary.channels,
          registrations: d?.registrations,
          nativeWindows: d?.nativeWindows,
        }
      }),
    )
  }
  function resource(policy: Policy) {
    return policy.resource
      ? resources.read(policy.resource)?.versions.find((v) => v.id === policy.resourceVersion)
      : null
  }
  function fresh(policy: Policy, preview: Preview) {
    const scope = scopes.freeze(preview.scope.id),
      version = resource(policy)
    return (
      !preview.executed &&
      policy.read.revision === preview.revision &&
      JSON.stringify(native.policyRecords(policy.read.id)) === JSON.stringify(preview.history) &&
      scope !== null &&
      JSON.stringify(scope) === JSON.stringify(preview.scope) &&
      version?.state === 'active' &&
      JSON.stringify(version.digest) === JSON.stringify(preview.resourceDigest) &&
      capability(preview.scope.members) === preview.capabilities
    )
  }
  function receipt(policy: Policy, request: string) {
    return {
      policy: policy.read.id,
      request,
      storageRevision: policy.read.storageRevision,
      planId: policy.read.plan,
      planIsFresh: policy.read.fresh,
      task: null,
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    const status = /^\/api\/v2\/plan-previews\/([^/]+)$/.exec(request.path)
    const match =
      /^\/api\/v2\/policies\/([^/]+)(?:\/(previews|plans|results)(?:\/([^/]+)(?:\/(execute|targets|add|supersede|retain|cancel|predecessors))?)?)?$/.exec(
        request.path,
      )
    if (!status && !match) return
    try {
      if (scenario === 'denied') return error('permission_denied', 403)
      if (status && request.method === 'GET') {
        const task = uuid(status[1]),
          preview = previews.get(task),
          policy = preview ? policies.get(preview.policy) : null
        if (!preview || !policy) return error('operation_not_found', 404)
        if (preview.status === 'running' && preview.reads++ > 0) {
          preview.status = !fresh(policy, preview)
            ? 'superseded'
            : preview.failure
              ? 'failed'
              : 'completed'
        }
        return ok({
          task,
          kind: 'policy',
          target: preview.policy,
          status: preview.status,
          processed: preview.status === 'running' ? 0 : preview.scope.members.length,
          members: preview.scope.members.length,
          plan: preview.status === 'completed' ? preview.plan : null,
          failure: preview.failure,
          failureDetail: preview.failure
            ? { reason: preview.failure, device: preview.failedDevice, stage: 'preview' }
            : null,
          execution: null,
          policyRevision: preview.revision,
        })
      }
      if (!match) return
      const id = identifier(decodeURIComponent(match[1]!)),
        policy = policies.get(id)
      if (request.method === 'GET') {
        if (!policy) return error('policy_not_found', 404)
        if (match[2] === 'results') {
          const task = uuid(match[3]),
            preview = previews.get(task)
          if (!preview || preview.policy !== id) return error('operation_not_found', 404)
          if (preview.status !== 'completed') return error('operation_conflict')
          const projection = enumeration(match[4], [
            'targets',
            'add',
            'supersede',
            'retain',
            'cancel',
            'predecessors',
          ] as const)
          const items =
            projection === 'targets'
              ? preview.scope.members
              : preview.intents.filter(
                  (i) => i.kind === (projection === 'predecessors' ? 'predecessor' : projection),
                )
          const page = pages.page<unknown>(request.path, items, request.query, task)
          return ok({
            result: task,
            policy: id,
            plan: preview.plan,
            totalTargets: preview.scope.members.length,
            totalExecutions: preview.history.length,
            page: { kind: projection === 'targets' ? 'targets' : 'intents', items: page.items },
            nextCursor: page.nextCursor,
          })
        }
        const saved = policy.saved ? previews.get(policy.saved) : null
        return ok({ ...policy.read, fresh: saved ? fresh(policy, saved) : false })
      }
      if (request.method !== 'POST') return
      if (match[2] === 'plans' && match[4] === 'execute') {
        const body = closed(request.body, ['operationId', 'expectedRevision', 'deadline'])
        return receipts.write(request, uuid(body['operationId']), () => {
          const preview = policy?.saved ? previews.get(policy.saved) : null
          if (
            !policy ||
            !preview ||
            preview.plan !== match[3] ||
            count(body['expectedRevision']) !== policy.read.storageRevision ||
            !fresh(policy, preview) ||
            preview.executed
          )
            return error('operation_conflict')
          const deadline = count(body['deadline'])
          if (deadline <= Math.floor(Date.now() / 1000)) return error('malformed_request', 400)
          const desired = preview.intents.filter((i) => i.kind === 'add' || i.kind === 'supersede')
          const admissions = desired.map((intent) => {
            if (!('device' in intent)) throw new Error('Invalid desired intent')
            const capability = devices
              .facts()
              .find((d) => d.summary.id === intent.device)?.nativeWindows
            if (!capability) throw new Error('Missing frozen capability')
            return {
              device: intent.device,
              operation: randomUUID(),
              task: {
                kind: 'firewall',
                enabled: preview.enabled,
                plan: preview.admission,
                policy: id,
                version: preview.version,
                ...capability,
              } satisfies FrozenNativeTask,
            }
          })
          // Validate the whole batch before any mutation. This synchronous server turn
          // cannot interleave a device/history change between validation and admission.
          for (const a of admissions) {
            const rejected = native.validateAdmission(a.device, a.operation, a.task, deadline)
            if (rejected) return rejected
          }
          const operations: unknown[] = []
          for (const intent of preview.intents) {
            if (intent.kind !== 'cancel' || !('execution' in intent)) continue
            const original = preview.history.find(
              (r) =>
                r.execution.device === intent.execution.device &&
                r.execution.version === intent.execution.version,
            )!
            operations.push(native.cancelPolicy(original.operation))
          }
          for (const a of admissions)
            operations.push(native.admit(a.device, a.operation, a.task, deadline, scenario).body)
          preview.executed = true
          return ok({ plan: preview.admission, operations }, 202)
        })
      }
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (op.expectedRevision !== (policy?.read.storageRevision ?? 0))
          return error('operation_conflict')
        if (match[2] === 'previews') {
          const input = closed(op.input, ['scope', 'expectedRevision'])
          if (
            !policy ||
            policy.read.status === 'draft' ||
            count(input['expectedRevision']) !== op.expectedRevision
          )
            return error('operation_conflict')
          const scope = scopes.freeze(uuid(input['scope'])),
            version = resource(policy)
          if (!scope || !version?.configuration || version.state !== 'active')
            return error('operation_conflict')
          const history = native.policyRecords(id)
          const intents: Intent[] = []
          for (const device of scope.members) {
            const previous = history.filter((r) => r.execution.device === device)
            if (
              policy.read.status !== 'active' ||
              previous.some((r) => r.execution.version === policy.version)
            )
              continue
            intents.push({
              kind: previous.length ? 'supersede' : 'add',
              device,
              version: policy.version,
            })
            for (const prior of previous)
              intents.push({
                kind: 'predecessor',
                execution: structuredClone(prior.execution),
                successor_version: policy.version,
              })
          }
          for (const record of history) {
            const execution = structuredClone(record.execution)
            const reason =
              policy.read.status === 'archived'
                ? 'archived'
                : !scope.members.includes(execution.device)
                  ? 'scope_exit'
                  : execution.version !== policy.version
                    ? 'superseded'
                    : null
            const terminal = ['succeeded', 'failed', 'cancelled'].includes(execution.progress)
            intents.push(
              reason
                ? {
                    kind: terminal ? 'retain' : 'cancel',
                    execution,
                    reason: terminal ? 'historical' : reason,
                  }
                : {
                    kind: 'retain',
                    execution,
                    reason: policy.read.status === 'paused' ? 'paused' : 'current',
                  },
            )
          }
          const desired = intents.flatMap((i) => ('device' in i ? [i.device] : []))
          const facts = devices.facts(),
            failed = desired.find((id) => {
              const d = facts.find((d) => d.summary.id === id)
              return (
                !d ||
                d.summary.platform !== 'windows' ||
                !d.summary.channels.includes('mdm') ||
                !d.registrations.some((r) => r.status === 'active' && r.source === 'mdm.windows') ||
                !d.nativeWindows
              )
            })
          const failedDevice = failed ? facts.find((d) => d.summary.id === failed) : null
          const capabilities = capability(scope.members)
          const plan = createHash('sha256')
            .update(
              JSON.stringify([
                id,
                policy.read.revision,
                scope,
                version.digest,
                capabilities,
                history,
                intents,
              ]),
            )
            .digest('hex')
          previews.set(op.operationId, {
            policy: id,
            history,
            intents,
            revision: policy.read.revision,
            scope,
            resourceDigest: [...version.digest],
            enabled: version.configuration.enabled,
            version: policy.version,
            plan,
            admission: randomUUID(),
            capabilities,
            reads: 0,
            status: 'running',
            failure: failed
              ? failedDevice?.summary.platform !== 'windows'
                ? 'platform_unsupported'
                : 'capability_unknown'
              : scenario === 'partial'
                ? 'capability_unknown'
                : null,
            failedDevice: failed ?? null,
            executed: false,
          })
          return ok(
            {
              task: op.operationId,
              kind: 'policy',
              target: id,
              statusUrl: `/api/v2/plan-previews/${op.operationId}`,
            },
            202,
          )
        }
        if (match[2] === 'plans') {
          const input = closed(op.input, ['preview']),
            task = uuid(input['preview']),
            preview = previews.get(task)
          if (
            !policy ||
            !preview ||
            preview.policy !== id ||
            preview.status !== 'completed' ||
            !fresh(policy, preview)
          )
            return error('operation_conflict')
          policy.saved = task
          policy.read.plan = preview.plan
          policy.read.fresh = true
          policy.read.storageRevision++
          return ok({
            receipt: receipt(policy, op.operationId),
            preview: task,
            plan: preview.plan,
            dispatch: 'not_requested',
          })
        }
        if (match[2]) return error('malformed_request', 400)
        const input = record(op.input),
          action = enumeration(input['action'], [
            'create',
            'activate',
            'pause',
            'resume',
            'archive',
          ] as const)
        if (action === 'create') {
          closed(input, ['action'])
          if (policy) return error('operation_conflict')
          const next: Policy = {
            read: {
              id,
              storageRevision: 1,
              revision: 0,
              status: 'draft',
              plan: null,
              fresh: false,
            },
            resource: null,
            resourceVersion: null,
            version: 0,
            saved: null,
          }
          policies.set(id, next)
          return ok(receipt(next, op.operationId))
        }
        if (!policy || policy.read.status === 'archived') return error('operation_conflict')
        if (action === 'activate') {
          closed(input, ['action', 'version', 'resource', 'resourceVersion'])
          const version = count(input['version']),
            resourceId = identifier(input['resource']),
            resourceVersion = identifier(input['resourceVersion'])
          const selected = resources
            .read(resourceId)
            ?.versions.find((v) => v.id === resourceVersion)
          if (version <= policy.version || selected?.state !== 'active' || !selected.configuration)
            return error('operation_conflict')
          policy.version = version
          policy.resource = resourceId
          policy.resourceVersion = resourceVersion
          policy.read.status = 'active'
        } else {
          closed(input, ['action'])
          if (
            (action === 'pause' && policy.read.status !== 'active') ||
            (action === 'resume' && policy.read.status !== 'paused')
          )
            return error('operation_conflict')
          policy.read.status =
            action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'archived'
        }
        policy.read.revision++
        policy.read.storageRevision++
        policy.read.fresh = false
        return ok(receipt(policy, op.operationId))
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    references: (resource: string, version: string) =>
      [...policies.values()].some(
        (p) =>
          p.read.status !== 'archived' && p.resource === resource && p.resourceVersion === version,
      ),
    list: () =>
      [...policies.values()].map((p) => ({
        id: p.read.id,
        label: p.read.id,
        revision: p.read.storageRevision,
        status: p.read.status,
      })),
    reset() {
      policies.clear()
      previews.clear()
      receipts.reset()
      pages.reset()
    },
  }
}
