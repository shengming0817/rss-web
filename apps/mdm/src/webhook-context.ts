import type { Query } from './AdminUi'

export type WebhookTab = 'subscriptions' | 'deliveries' | 'materials' | 'health'
function publicContext(params?: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams(),
    names = [
      'tab',
      'subscription',
      'deliverySubscription',
      'delivery',
      'operation',
      'reference',
      ...['subscription', 'delivery'].flatMap((owner) =>
        ['filter', 'sort', 'fields', 'limit', 'cursor'].map((key) => `${owner}.${key}`),
      ),
    ]
  params?.forEach((value, key) => {
    if (names.includes(key)) result.set(key, value)
  })
  return result
}
export function webhookDirectory(
  params: URLSearchParams,
  owner: 'subscription' | 'delivery',
): Query {
  const prefix = owner + '.',
    query: Query = { limit: 32 }
  const filter = params.get(prefix + 'filter'),
    fields = params.get(prefix + 'fields'),
    sort = params.get(prefix + 'sort'),
    limit = params.get(prefix + 'limit'),
    cursor = params.get(prefix + 'cursor')
  return {
    ...query,
    ...(filter === null ? {} : { filter }),
    ...(fields === null ? {} : { fields: fields.split(',') }),
    ...(sort === null ? {} : { sort: sort.split(',') }),
    ...(limit === null ? {} : { limit: Number(limit) }),
    ...(cursor === null ? {} : { cursor }),
  }
}
export function setWebhookDirectory(
  params: URLSearchParams,
  owner: 'subscription' | 'delivery',
  query: Query,
): URLSearchParams {
  const result = publicContext(params),
    prefix = owner + '.'
  for (const key of ['filter', 'sort', 'fields', 'limit', 'cursor'] as const) {
    result.delete(prefix + key)
    const value = query[key]
    if (value !== undefined)
      result.set(prefix + key, Array.isArray(value) ? value.join(',') : String(value))
  }
  return result
}
export function webhookHref(
  values: {
    tab?: WebhookTab
    subscription?: string
    deliverySubscription?: string
    delivery?: string
    operation?: string
    reference?: string
  } = {},
  current?: URLSearchParams,
): string {
  const query = publicContext(current)
  if (values.tab === 'deliveries' && values.deliverySubscription !== undefined) {
    query.delete('delivery.cursor')
    query.delete('delivery')
  }
  for (const [key, value] of Object.entries(values))
    if (
      [
        'tab',
        'subscription',
        'deliverySubscription',
        'delivery',
        'operation',
        'reference',
      ].includes(key) &&
      value
    )
      query.set(key, value)
  return '/webhooks' + (query.size ? '?' + query.toString() : '')
}
