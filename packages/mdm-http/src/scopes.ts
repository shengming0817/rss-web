import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import type { ScopeOwner, ScopesPort } from '@rss/mdm-scopes'
import { uuid } from './decode'
import { windowQuery } from './inventory-values'

function coordinates(owner: ScopeOwner) { return { policy: uuid(owner.policyId) } }
/** One current Policy-owned Scope protocol over the application's session transport. */
export function createScopesAdapter(transport: HttpTransport): ScopesPort {
  return {
    read: (owner, signal) => owner.stageId
      ? api.getApiV1PoliciesByPolicyStagesByStageScope(transport, { signal, pathParams: { ...coordinates(owner), stage: uuid(owner.stageId) } })
      : api.getApiV1PoliciesByPolicyScope(transport, { signal, pathParams: coordinates(owner) }),
    preview: (owner, body, signal) => owner.stageId
      ? api.postApiV1PoliciesByPolicyStagesByStageScopePreviews(transport, { signal, pathParams: { ...coordinates(owner), stage: uuid(owner.stageId) }, body })
      : api.postApiV1PoliciesByPolicyScopePreviews(transport, { signal, pathParams: coordinates(owner), body }),
    recompute: (owner, body) => owner.stageId
      ? api.postApiV1PoliciesByPolicyStagesByStageScopeRecomputations(transport, { pathParams: { ...coordinates(owner), stage: uuid(owner.stageId) }, body })
      : api.postApiV1PoliciesByPolicyScopeRecomputations(transport, { pathParams: coordinates(owner), body }),
    task: (owner, _scope, task, signal) => owner.stageId
      ? api.getApiV1PoliciesByPolicyStagesByStageScopeTasksByTask(transport, { signal, pathParams: { ...coordinates(owner), stage: uuid(owner.stageId), task } })
      : api.getApiV1PoliciesByPolicyScopeTasksByTask(transport, { signal, pathParams: { ...coordinates(owner), task } }),
    result: (owner, _scope, result, kind, channel, query, signal) => owner.stageId
      ? api.getApiV1PoliciesByPolicyStagesByStageScopeResultsByResultByKind(transport, { signal, pathParams: { ...coordinates(owner), stage: uuid(owner.stageId), result, kind }, query: { ...windowQuery(query), channel } })
      : api.getApiV1PoliciesByPolicyScopeResultsByResultByKind(transport, { signal, pathParams: { ...coordinates(owner), result, kind }, query: { ...windowQuery(query), channel } }),
  }
}
