import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import { array, nullable, string, unique, uuid } from '../../../services/decode'
import { candidate } from './model'
import {
  connector,
  alertRule,
  delegation,
  metrics,
  report,
  delivery,
  configuration,
  diagnostics,
  maintenance,
  type Connector,
  type AlertRule,
  type Maintenance,
} from './admin-model'
export function createAdminClients(transport: HttpTransport, tenant: string, demo: boolean) {
  function read<T>(
    path: string,
    key: string,
    decode: (v: unknown) => T,
    query?: Record<string, string | number | undefined>,
  ) {
    return transport.request({
      method: 'GET',
      path,
      ...(query ? { query } : {}),
      successStatus: 200,
      decode: (v) => {
        const value = decode(candidate(v, tenant, demo, [key])[key])
        const target = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(
          path,
        )?.[1]
        if (target && (value as { id?: string }).id !== target)
          throw new Error('Wrong management target')
        return value
      },
    })
  }
  function page<T extends { id: string }>(
    path: string,
    decode: (v: unknown) => T,
    query: Record<string, string | number | undefined> = {},
  ) {
    return transport.request({
      method: 'GET',
      path,
      query: { limit: 20, ...query },
      successStatus: 200,
      decode(value) {
        const v = candidate(value, tenant, demo, ['items', 'snapshot', 'nextCursor'])
        return {
          items: unique(array(v['items'], decode), (x) => x.id),
          snapshot: uuid(v['snapshot']),
          nextCursor: nullable(v['nextCursor'], string),
        }
      },
    })
  }
  function write<T extends { operation: string | null }>(
    path: string,
    key: string,
    body: Operation<unknown>,
    decode: (v: unknown) => T,
    status: 200 | 202 = 200,
  ) {
    return transport.request({
      method: 'POST',
      path,
      body,
      successStatus: status,
      decode: (v) => {
        const value = decode(candidate(v, tenant, demo, [key])[key])
        if (value.operation !== body.operationId) throw new Error('Wrong management receipt')
        return value
      },
    })
  }
  return {
    delegations: (cursor?: string) =>
      page('/api/mdm-candidate/v1/authorization/delegations', delegation, { cursor }),
    metrics: (from: number, until: number) =>
      read('/api/mdm-candidate/v1/operations/metrics', 'metrics', metrics, { from, until }),
    reports: {
      list: (cursor?: string) =>
        page('/api/mdm-candidate/v1/operations/reports', report, { cursor }),
      read: (id: string) =>
        read(`/api/mdm-candidate/v1/operations/reports/${uuid(id)}`, 'job', report),
      run: (body: Operation<{ from: number; until: number }>) =>
        write('/api/mdm-candidate/v1/operations/reports', 'job', body, report, 202),
    },
    alertRules: {
      list: (cursor?: string) =>
        page('/api/mdm-candidate/v1/operations/alert-rules', alertRule, { cursor }),
      save: (id: string, body: Operation<AlertRule['definition']>) =>
        write(`/api/mdm-candidate/v1/operations/alert-rules/${uuid(id)}`, 'rule', body, alertRule),
    },
    connectors: {
      attempt: (id: string, attempt: string) =>
        read(
          `/api/mdm-candidate/v1/integrations/connectors/${uuid(id)}/attempts/${uuid(attempt)}`,
          'delivery',
          (value) => {
            const v = delivery(value)
            if (v.connector !== id) throw new Error('Wrong connector attempt')
            return v
          },
        ),
      list: (cursor?: string) =>
        page('/api/mdm-candidate/v1/integrations/connectors', connector, { cursor }),
      read: (id: string) =>
        read(`/api/mdm-candidate/v1/integrations/connectors/${uuid(id)}`, 'connector', connector),
      save: (id: string, body: Operation<Connector['definition']>) =>
        write(
          `/api/mdm-candidate/v1/integrations/connectors/${uuid(id)}`,
          'connector',
          body,
          connector,
        ),
      test: (id: string, body: Operation<Record<string, never>>) =>
        write(
          `/api/mdm-candidate/v1/integrations/connectors/${uuid(id)}/test`,
          'delivery',
          body,
          delivery,
          202,
        ),
      deliver: (id: string, body: Operation<Record<string, never>>) =>
        write(
          `/api/mdm-candidate/v1/integrations/connectors/${uuid(id)}/deliver`,
          'delivery',
          body,
          delivery,
          202,
        ),
      deliveries: (id: string, cursor?: string) =>
        page(`/api/mdm-candidate/v1/integrations/connectors/${uuid(id)}/deliveries`, delivery, {
          cursor,
        }),
      retry: (id: string, attempt: string, body: Operation<Record<string, never>>) =>
        write(
          `/api/mdm-candidate/v1/integrations/connectors/${uuid(id)}/deliveries/${uuid(attempt)}/retry`,
          'delivery',
          body,
          delivery,
          202,
        ),
    },
    settings: {
      read: () => read('/api/mdm-candidate/v1/operations/settings', 'configuration', configuration),
      save: (body: Operation<ReturnType<typeof configuration>['values']>) =>
        write('/api/mdm-candidate/v1/operations/settings', 'configuration', body, configuration),
      activate: (body: Operation<Record<string, never>>) =>
        write(
          '/api/mdm-candidate/v1/operations/settings/activate',
          'configuration',
          body,
          configuration,
        ),
      diagnostics: () =>
        read('/api/mdm-candidate/v1/operations/diagnostics', 'diagnostics', diagnostics),
    },
    maintenance: {
      list: (cursor?: string) =>
        page('/api/mdm-candidate/v1/operations/maintenance', maintenance, { cursor }),
      read: (id: string) =>
        read(`/api/mdm-candidate/v1/operations/maintenance/${uuid(id)}`, 'job', maintenance),
      start: (body: Operation<Maintenance['input']>) =>
        write('/api/mdm-candidate/v1/operations/maintenance', 'job', body, maintenance, 202),
      change: (
        id: string,
        action: 'pause' | 'resume' | 'cancel',
        body: Operation<Record<string, never>>,
      ) =>
        write(
          `/api/mdm-candidate/v1/operations/maintenance/${uuid(id)}/${action}`,
          'job',
          body,
          maintenance,
        ),
    },
  }
}
