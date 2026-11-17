import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import type { HttpTransport } from '@rss/api/mdm'
import type { ScopeOwner, ScopeTask, ScopesPort } from '@rss/mdm-scopes'
import { enumeration, uuid } from './decode'
import { requestInput, windowQuery } from './inventory-values'

function taskResult(
  value: api.getApiV1TenantsByTenantPoliciesByPolicyScopeTasksByTaskContract.Output,
): ScopeTask {
  if (value.kind !== 'scope') throw new Error('Wrong scope task kind')
  return {
    ...value,
    kind: 'scope',
    status: enumeration(value.status, [
      'pending',
      'running',
      'completed',
      'failed',
      'superseded',
    ] as const),
  }
}
function coordinates(owner: ScopeOwner) {
  return { policy: uuid(owner.policyId) }
}
/** One current Policy-owned Scope protocol over the application's session transport. */
export function createScopesAdapter(transport: HttpTransport, tenant: string): ScopesPort {
  return {
    read: (owner, signal) =>
      owner.stageId
        ? api.getApiV1TenantsByTenantPoliciesByPolicyStagesByStageScope(transport, {
            signal,
            pathParams: { tenant, ...coordinates(owner), stage: uuid(owner.stageId) },
          })
        : api.getApiV1TenantsByTenantPoliciesByPolicyScope(transport, {
            signal,
            pathParams: { tenant, ...coordinates(owner) },
          }),
    preview: (owner, body, signal) =>
      owner.stageId
        ? api.postApiV1TenantsByTenantPoliciesByPolicyStagesByStageScopePreviews(transport, {
            signal,
            pathParams: { tenant, ...coordinates(owner), stage: uuid(owner.stageId) },
            body: requestInput(
              body,
              schema.postApiV1TenantsByTenantPoliciesByPolicyStagesByStageScopePreviewsBody
                .validateRoot,
            ),
          })
        : api.postApiV1TenantsByTenantPoliciesByPolicyScopePreviews(transport, {
            signal,
            pathParams: { tenant, ...coordinates(owner) },
            body: requestInput(
              body,
              schema.postApiV1TenantsByTenantPoliciesByPolicyScopePreviewsBody.validateRoot,
            ),
          }),
    recompute: (owner, body) =>
      owner.stageId
        ? api.postApiV1TenantsByTenantPoliciesByPolicyStagesByStageScopeRecomputations(transport, {
            pathParams: { tenant, ...coordinates(owner), stage: uuid(owner.stageId) },
            body,
          })
        : api.postApiV1TenantsByTenantPoliciesByPolicyScopeRecomputations(transport, {
            pathParams: { tenant, ...coordinates(owner) },
            body,
          }),
    task: (owner, _scope, task, signal) =>
      owner.stageId
        ? api.getApiV1TenantsByTenantPoliciesByPolicyStagesByStageScopeTasksByTask(
            transport,
            {
              signal,
              pathParams: { tenant, ...coordinates(owner), stage: uuid(owner.stageId), task },
            },
            taskResult,
          )
        : api.getApiV1TenantsByTenantPoliciesByPolicyScopeTasksByTask(
            transport,
            { signal, pathParams: { tenant, ...coordinates(owner), task } },
            taskResult,
          ),
    result: (owner, _scope, result, kind, channel, query, signal) =>
      owner.stageId
        ? api.getApiV1TenantsByTenantPoliciesByPolicyStagesByStageScopeResultsByResultByKind(
            transport,
            {
              signal,
              pathParams: {
                tenant,
                ...coordinates(owner),
                stage: uuid(owner.stageId),
                result,
                kind,
              },
              query: { ...windowQuery(query), channel },
            },
          )
        : api.getApiV1TenantsByTenantPoliciesByPolicyScopeResultsByResultByKind(transport, {
            signal,
            pathParams: { tenant, ...coordinates(owner), result, kind },
            query: { ...windowQuery(query), channel },
          }),
  }
}
