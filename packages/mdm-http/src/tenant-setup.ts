import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import { capabilities, channels, intent, stepIds, stepStatuses } from '@rss/mdm-tenant-setup'
import type { Catalog, Entry, Intent, Receipt, SetupPort } from '@rss/mdm-tenant-setup'
import { boolean, count, enumeration, list, nullable, record, text, uuid } from './decode'
function selection(value: unknown): Intent {
  const v = record(value),
    decisions = record(v['capabilities'])
  const mapped: Partial<
    Record<(typeof capabilities)[number], { kind: 'configure' } | { kind: 'skip'; reason: string }>
  > = {}
  for (const [name, raw] of Object.entries(decisions)) {
    const key = enumeration(name, capabilities),
      d = record(raw),
      kind = enumeration(d['kind'], ['configure', 'skip'] as const)
    mapped[key] = kind === 'configure' ? { kind } : { kind, reason: text(d['reason']) }
  }
  return intent({
    channels: list(v['channels'], (c) => enumeration(c, channels), 3),
    capabilities: mapped,
    completionRequested: boolean(v['completionRequested']),
  })
}
function saved(value: unknown) {
  const v = record(value)
  return { revision: count(v['revision']), intent: selection(v['intent']) }
}
function receipt(value: unknown): Receipt {
  const v = record(value)
  return { operationId: uuid(v['operationId']), saved: saved(v['saved']) }
}
function entry(value: unknown): Entry {
  const v = record(value)
  return {
    id: text(v['id']),
    scope: enumeration(v['scope'], ['deployment', 'platform', 'tenant', 'device'] as const),
    owner: text(v['owner']),
    custody: text(v['custody']),
    lifecycle: text(v['lifecycle']),
    status: enumeration(v['status'], [
      'unknown',
      'unconfigured',
      'configured',
      'loaded',
      'pending',
      'unavailable',
    ] as const),
    revision: nullable(v['revision'], count),
    desiredRevision: nullable(v['desiredRevision'], count),
    appliedRevision: nullable(v['appliedRevision'], count),
    configuredCount: nullable(v['configuredCount'], count),
    reason: nullable(v['reason'], text),
  }
}
function unique<T extends { readonly id: string }>(values: T[]): T[] {
  if (new Set(values.map((v) => v.id)).size !== values.length) throw new Error('Duplicate identity')
  return values
}
export function createCatalogAdapter(
  transport: HttpTransport,
  management: boolean,
): () => Promise<Catalog> {
  const decode = (value: unknown): Catalog => {
    const v = record(value)
    return {
      items: unique(list(v['items'], entry)),
      domains: unique(
        list(v['domains'], (raw) => {
          const d = record(raw)
          return { id: text(d['id']), href: text(d['href']) }
        }),
      ),
    }
  }
  return () =>
    management
      ? api.getApiV1TenantAdministrationSettingsCatalog(transport, {}, decode)
      : api.getApiV1SettingsCatalog(transport, {}, decode)
}
export function createTenantSetupAdapter(transport: HttpTransport, tenant: string): SetupPort {
  return {
    catalog: createCatalogAdapter(transport, false),
    read: () =>
      api.getApiV1SettingsFirstUse(transport, {}, (value) => {
        if (value['tenantId'] !== tenant) throw new Error('Wrong setup tenant')
        return {
          tenantId: uuid(value['tenantId']),
          saved: saved(value['saved']),
          steps: unique(
            list(value['steps'], (raw) => {
              const s = record(raw)
              return {
                id: enumeration(s['id'], stepIds),
                status: enumeration(s['status'], stepStatuses),
                reason: nullable(s['reason'], text),
                evidence: unique(list(s['evidence'], entry)),
              }
            }),
          ),
          canComplete: boolean(value['canComplete']),
          complete: boolean(value['complete']),
        }
      }),
    update: (command) =>
      api.putApiV1SettingsFirstUse(
        transport,
        {
          headers: { 'Idempotency-Key': command.operationId },
          body: {
            expectedRevision: command.expectedRevision,
            intent: { ...command.intent, channels: [...command.intent.channels] },
          },
        },
        receipt,
      ),
    operation: (id) =>
      api.getApiV1SettingsFirstUseOperationsById(transport, { pathParams: { id } }, receipt),
  }
}
