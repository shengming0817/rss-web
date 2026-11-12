import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import type { HttpTransport } from '@rss/api/mdm'
import type { ScopeOwner, ScopeTask, ScopesPort } from '@rss/mdm-scopes'
import { enumeration, uuid } from './decode'
import { requestInput, windowQuery } from './inventory-values'

function taskResult(value: api.getApiV1PoliciesByPolicyScopeTasksByTaskContract.Output): ScopeTask {
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
export function createScopesAdapter(transport: HttpTransport): ScopesPort {
  return {
    read: (owner, signal) =>
      owner.stageId
        ? api.getApiV1PoliciesByPolicyStagesByStageScope(transport, {
            signal,
            pathParams: { ...coordinates(owner), stage: uuid(owner.stageId) },
          })
        : api.getApiV1PoliciesByPolicyScope(transport, { signal, pathParams: coordinates(owner) }),
    preview: (owner, body, signal) =>
      owner.stageId
        ? api.postApiV1PoliciesByPolicyStagesByStageScopePreviews(transport, {
            signal,
            pathParams: { ...coordinates(owner), stage: uuid(owner.stageId) },
            body: requestInput(
              body,
              schema.postApiV1PoliciesByPolicyStagesByStageScopePreviewsBody.validateRoot,
            ),
          })
        : api.postApiV1PoliciesByPolicyScopePreviews(transport, {
            signal,
            pathParams: coordinates(owner),
            body: requestInput(
              body,
              schema.postApiV1PoliciesByPolicyScopePreviewsBody.validateRoot,
            ),
          }),
    recompute: (owner, body) =>
      owner.stageId
        ? api.postApiV1PoliciesByPolicyStagesByStageScopeRecomputations(transport, {
            pathParams: { ...coordinates(owner), stage: uuid(owner.stageId) },
            body,
          })
        : api.postApiV1PoliciesByPolicyScopeRecomputations(transport, {
            pathParams: coordinates(owner),
            body,
          }),
    task: (owner, _scope, task, signal) =>
      owner.stageId
        ? api.getApiV1PoliciesByPolicyStagesByStageScopeTasksByTask(
            transport,
            { signal, pathParams: { ...coordinates(owner), stage: uuid(owner.stageId), task } },
            taskResult,
          )
        : api.getApiV1PoliciesByPolicyScopeTasksByTask(
            transport,
            { signal, pathParams: { ...coordinates(owner), task } },
            taskResult,
          ),
    result: (owner, _scope, result, kind, channel, query, signal) =>
      owner.stageId
        ? api.getApiV1PoliciesByPolicyStagesByStageScopeResultsByResultByKind(transport, {
            signal,
            pathParams: { ...coordinates(owner), stage: uuid(owner.stageId), result, kind },
            query: { ...windowQuery(query), channel },
          })
        : api.getApiV1PoliciesByPolicyScopeResultsByResultByKind(transport, {
            signal,
            pathParams: { ...coordinates(owner), result, kind },
            query: { ...windowQuery(query), channel },
          }),
  }
}
