import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type {
  Assessment,
  CompliancePort,
  Current,
  CurrentRule,
  Definition,
  HistoryEntry,
  Rule,
  RuleRow,
} from '@rss/mdm-compliance'
import { boolean, count, enumeration, nullable, positive, text, uuid } from './decode'
import {
  boundedObject,
  condition,
  distinct,
  integer,
  requestInput,
  windowQuery,
} from './inventory-values'

function definition(value: unknown): Definition {
  if (!schema.getApiV1ComplianceRulesByIdResponse.validateDefinition(value))
    throw new Error('Invalid compliance definition')
  return {
    ...value,
    presentation: boundedObject(value.presentation),
    target: structuredClone(value.target),
    criteria: condition(value.criteria),
  }
}
function rule(value: unknown, id: string, revision?: number): Rule {
  if (!schema.getApiV1ComplianceRulesByIdResponse.validateRoot(value))
    throw new Error('Invalid compliance rule')
  if (uuid(value.id) !== id || (revision !== undefined && value.revision !== revision))
    throw new Error('Wrong compliance rule binding')
  return { id, revision: positive(value.revision), definition: definition(value.definition) }
}
function assessment(value: unknown): Assessment {
  if (!schema.getApiV1DevicesByIdComplianceResponse.validateAssessment(value))
    throw new Error('Invalid compliance assessment')
  const evidence = value.evidence.map((field) => {
    if (field.sources.length > 2) throw new Error('Invalid field evidence budget')
    return {
      ...field,
      sources: distinct(
        field.sources.map((source) => ({
          ...source,
          registrationGeneration: nullable(source.registrationGeneration, count),
          observedAt: integer(source.observedAt),
          receivedAt: integer(source.receivedAt),
        })),
        (source) => source.source,
      ),
    }
  })
  return {
    ...value,
    ruleId: uuid(value.ruleId),
    ruleVersion: positive(value.ruleVersion),
    factWatermark: count(value.factWatermark),
    evaluatedAt: integer(value.evaluatedAt),
    groups: distinct(
      value.groups.map((group) => ({
        ...group,
        id: uuid(group.id),
        revision: positive(group.revision),
        memberVersion: count(group.memberVersion),
        assetWatermark: nullable(group.assetWatermark, count),
        memberSet: nullable(group.memberSet, uuid),
      })),
      (group) => group.id,
    ),
    applicability: {
      ...value.applicability,
      sources: value.applicability.sources.map((source) => ({ ...source })),
      groups: value.applicability.groups.map((group) => ({ ...group })),
    },
    explanations: value.explanations.map((explanation) => ({
      ...explanation,
      path: explanation.path.map(count),
    })),
    evidence: distinct(evidence, (field) => JSON.stringify([field.context, field.field])),
  }
}
function current(value: unknown, device: string): Current {
  if (!schema.getApiV1DevicesByIdComplianceResponse.validateRoot(value) || value.device !== device)
    throw new Error('Wrong compliance device')
  const rules = distinct(
    value.rules.map((row): CurrentRule => {
      const ruleId = uuid(row.ruleId),
        ruleVersion = positive(row.ruleVersion),
        now = nullable(row.current, assessment),
        previous = nullable(row.previous, assessment)
      if (
        now &&
        (now.ruleId !== ruleId || now.ruleVersion !== ruleVersion || now.status !== row.status)
      )
        throw new Error('Wrong current assessment coordinates')
      if (previous && (previous.ruleId !== ruleId || previous.ruleVersion > ruleVersion))
        throw new Error('Wrong previous assessment coordinates')
      if (row.status === 'pending') {
        if (now !== null) throw new Error('Pending rule contains current evidence')
        return { ruleId, ruleVersion, status: 'pending', current: null, previous }
      }
      return { ruleId, ruleVersion, status: row.status, current: now, previous }
    }),
    (row) => row.ruleId,
  )
  if (
    (value.reason === 'no_rules') !== (rules.length === 0) ||
    (value.reason === 'no_rules' && value.status !== 'unknown')
  )
    throw new Error('Invalid empty compliance state')
  return { device, status: value.status, reason: value.reason, rules }
}
const directoryFields = {
  id: uuid,
  revision: positive,
  name: (value: unknown) => nullable(value, text),
  enabled: (value: unknown) => nullable(value, boolean),
  deleted: boolean,
  severity: (value: unknown) =>
    nullable(value, (value) => enumeration(value, ['low', 'medium', 'high', 'critical'] as const)),
  platform: (value: unknown) =>
    nullable(value, (value) => enumeration(value, ['all', 'windows', 'macos'] as const)),
  targetKind: (value: unknown) =>
    nullable(value, (value) => enumeration(value, ['all', 'groups'] as const)),
  definition: (value: unknown) => nullable(value, definition),
}
/** The sole bound transport performs authentication/CSRF; this module owns compliance wire binding. */
export function createComplianceAdapter(transport: HttpTransport): CompliancePort {
  return {
    list: (query = {}) => {
      if (query.fields && !query.fields.includes('id'))
        throw new Error('Directory identity required')
      return api.getApiV1ComplianceRules(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (value) =>
          projectedPage(value, directoryFields, query.fields, ['id']) as {
            items: RuleRow[]
            nextCursor: string | null
          },
      )
    },
    read: (id) =>
      api.getApiV1ComplianceRulesById(transport, { pathParams: { id: uuid(id) } }, (value) =>
        rule(value, id),
      ),
    version: (id, revision) =>
      api.getApiV1ComplianceRulesByIdVersionsByRevision(
        transport,
        { pathParams: { id: uuid(id), revision: positive(revision) } },
        (value) => rule(value, id, revision),
      ),
    put: (id, change) =>
      api.putApiV1ComplianceRulesById(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: requestInput(change, schema.putApiV1ComplianceRulesByIdBody.validateRoot),
        },
        (value) => {
          if (
            value.id !== id ||
            value.revision !== change.expectedRevision + 1 ||
            change.input.enabled !== (value.task !== null)
          )
            throw new Error('Wrong compliance write receipt')
          return { id, revision: positive(value.revision), task: nullable(value.task, uuid) }
        },
      ),
    remove: (id, change) =>
      api.deleteApiV1ComplianceRulesById(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: requestInput(change, schema.deleteApiV1ComplianceRulesByIdBody.validateRoot),
        },
        (value) => {
          if (value.id !== id || value.revision !== change.expectedRevision + 1 || !value.deleted)
            throw new Error('Wrong compliance deletion receipt')
          return { id, revision: positive(value.revision), deleted: true }
        },
      ),
    recompute: (id, change) =>
      api.postApiV1ComplianceRulesByIdRecompute(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: requestInput(change, schema.postApiV1ComplianceRulesByIdRecomputeBody.validateRoot),
        },
        (value) => ({ task: uuid(value.task) }),
      ),
    task: (id, task) =>
      api.getApiV1ComplianceRulesByIdTasksByTask(
        transport,
        { pathParams: { id: uuid(id), task: uuid(task) } },
        (value) => {
          if (value.ruleId !== id || value.task !== task)
            throw new Error('Wrong compliance task coordinates')
          return {
            ...value,
            ruleVersion: positive(value.ruleVersion),
            factWatermark: count(value.factWatermark),
            processed: count(value.processed),
          }
        },
      ),
    current: (device) =>
      api.getApiV1DevicesByIdCompliance(transport, { pathParams: { id: device } }, (value) =>
        current(value, device),
      ),
    history: (device, query = {}) =>
      api.getApiV1DevicesByIdComplianceHistory(
        transport,
        {
          pathParams: { id: device },
          query: {
            ...windowQuery(query),
            ...(query.from === undefined ? {} : { from: integer(query.from) }),
            ...(query.until === undefined ? {} : { until: integer(query.until) }),
          },
        },
        (value) => ({
          items: distinct(
            value.items.map((item): HistoryEntry => {
              const { task, disposition, ...facts } = item
              return { ...assessment(facts), task: uuid(task), disposition }
            }),
            (item) => item.task,
          ),
          nextCursor: nextCursor(value.nextCursor),
        }),
      ),
  }
}
