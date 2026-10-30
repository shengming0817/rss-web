import { expect, it } from 'vitest'
import { setWebhookDirectory, webhookDirectory, webhookHref } from './webhook-context'

it('keeps subscription and delivery cursor owners separate when restoring a query', () => {
  const current = new URLSearchParams(
      'subscription.cursor=YWJj&subscription.filter=enabled%3D%3Dfalse&delivery.cursor=ZGVm&delivery.fields=id%2Cstatus',
    ),
    next = setWebhookDirectory(current, 'subscription', { filter: "enabled=='true'", limit: 1 })
  expect(webhookDirectory(next, 'subscription')).not.toHaveProperty('cursor')
  expect(webhookDirectory(next, 'delivery')).toMatchObject({
    cursor: 'ZGVm',
    fields: ['id', 'status'],
  })
})
it('starts a newly selected delivery subscription scope without reusing its preceding cursor', () => {
  const current = new URLSearchParams(
      'tab=subscriptions&subscription=other&subscription.cursor=YWJj&delivery.cursor=ZGVm&deliverySubscription=previous',
    ),
    href = webhookHref({ tab: 'deliveries', deliverySubscription: 'next' }, current),
    next = new URLSearchParams(href.split('?')[1])
  expect(next.get('deliverySubscription')).toBe('next')
  expect(next.has('delivery.cursor')).toBe(false)
  expect(next.get('subscription.cursor')).toBe('YWJj')
})
it('does not copy private or unrelated URL parameters into navigation', () => {
  const current = new URLSearchParams('secret=private&payload=private&subscription.cursor=YWJj'),
    href = webhookHref({ tab: 'subscriptions' }, current)
  expect(href).not.toContain('private')
  expect(href).toContain('subscription.cursor=YWJj')
})
