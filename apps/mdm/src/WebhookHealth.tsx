import { Alert, Button, Card } from 'antd'
import type { Webhooks } from '@rss/mdm-webhooks'
import type { Locale } from './i18n'
import { labels, ReadState, useRead } from './AdminUi'
import { DataTable } from './DataTable'
import { Status } from './DevicePresentation'
export function WebhookHealth({
  webhooks,
  binding,
  authority,
  locale,
  canRead,
}: {
  webhooks: Webhooks
  binding: string
  authority: string
  locale: Locale
  canRead: boolean
}) {
  const l = labels(locale),
    read = useRead(`${binding}/${authority}/${canRead}/webhook-health`, async () => {
      if (!canRead) throw { code: 'forbidden', status: 403 }
      return webhooks.health()
    })
  return (
    <Card
      title={l('当前租户的投递健康', 'Current tenant delivery health')}
      extra={
        <Button disabled={!canRead} onClick={read.reload}>
          {l('读取投递健康', 'Read delivery health')}
        </Button>
      }
    >
      <Alert
        type="info"
        title={l(
          '统计涵盖当前租户的源事件与投递 Outbox；与当前设备权限下可见的投递目录各自独立，不代表接收端 SLA 或下游业务完成。',
          'These counts cover the current tenant source-event and delivery Outboxes. They are independent of delivery rows visible under device permissions and do not establish receiver SLA or downstream completion.',
        )}
      />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {canRead && read.value && (
        <DataTable
          locale={locale}
          rowKey={(row) => row.domain + '/' + row.status}
          dataSource={read.value.outbox}
          columns={[
            {
              title: l('Outbox 域', 'Outbox domain'),
              render: (_, row) =>
                row.domain === 'mdm-webhook-source'
                  ? l('源事件', 'Source events')
                  : l('外部投递', 'External deliveries'),
            },
            {
              title: l('结算状态', 'Settlement status'),
              render: (_, row) => <Status value={row.status} locale={locale} />,
            },
            { title: l('已记录数量', 'Recorded count'), dataIndex: 'count' },
          ]}
        />
      )}
    </Card>
  )
}
