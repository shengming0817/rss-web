import type { CollectionRun, DeliveryReceipt } from '@rss/mdm-inventory'
import { labels } from './AdminUi'
import type { Locale } from './i18n'

export function collectionReceiptText(locale: Locale, status: DeliveryReceipt['status']): string {
  const l = labels(locale)
  return {
    found: l('已收到', 'Received'),
    expired: l('已收到，回执已过期', 'Received, receipt expired'),
    not_found: l('未找到回执', 'Receipt not found'),
    no_batch: l('无观察批次', 'No observation batch'),
  }[status]
}

export function collectionProjectionText(
  locale: Locale,
  status: CollectionRun['delivery']['projection'],
): string {
  const l = labels(locale)
  return {
    projected: l('已投影', 'Projected'),
    pending: l('投影待处理', 'Projection pending'),
    pending_receipt: l('等待接收回执', 'Waiting for receipt'),
    unconfirmed: l('投影尚未确认', 'Projection unconfirmed'),
    not_applicable: l('无需投影', 'Projection not applicable'),
  }[status]
}
