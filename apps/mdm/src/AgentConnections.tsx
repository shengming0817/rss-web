import { useState } from 'react'
import { Button, Card, Space } from 'antd'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, labels, ReadState, useAction, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { timestamp } from './DevicePresentation'
import { useProtectedDelivery } from './useProtectedDelivery'
export function AgentConnections({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { connections, binding } = useAdministration(runtime),
    agent = connections.agent,
    action = useAction(),
    [page, setPage] = useState<{ revision: number; after?: string }>({ revision: 0 }),
    [downloadedRevision, setDownloadedRevision] = useState<number | null>(null),
    read = useRead(`${binding}/agent-connections`, agent.read),
    configuration = read.value?.configuration?.configuration,
    targetRevision = read.value?.convergence.targetRevision ?? null,
    after = page.revision === targetRevision ? page.after : undefined,
    devices = useRead(`${binding}/agent-convergence/${targetRevision ?? ''}/${after ?? ''}`, () =>
      targetRevision === null ? Promise.resolve(null) : agent.devices(targetRevision, after),
    ),
    delivery = useProtectedDelivery()
  return (
    <>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {read.value && (
        <>
          <Card title={l('当前签名连接配置', 'Current signed connection configuration')}>
            {configuration ? (
              <>
                <p>
                  {l('版本', 'Revision')} · {configuration.revision}
                </p>
                <p>
                  {l('首选地址', 'Preferred address')} · {configuration.preferredOrigin}
                </p>
                <ul>
                  {configuration.origins.map((origin) => (
                    <li key={origin}>{origin}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                {l(
                  '服务器尚未签发连接配置。',
                  'The server has not issued a connection configuration.',
                )}
              </p>
            )}
          </Card>
          <p>
            {l('确认 / 当前有效设备', 'Confirmed / active devices')} ·{' '}
            {read.value.convergence.confirmedDevices} / {read.value.convergence.activeDevices} ·{' '}
            {l('目标连接版本', 'Target revision')} {read.value.convergence.targetRevision ?? '—'}
          </p>
        </>
      )}
      <Button
        onClick={() => {
          read.reload()
          devices.reload()
        }}
      >
        {l('刷新连接状态', 'Refresh connection status')}
      </Button>
      <ReadState
        busy={devices.busy}
        error={devices.error}
        locale={locale}
        onRetry={devices.reload}
      />
      {devices.value && (
        <>
          <h2>
            {l('设备收敛', 'Device convergence')} · {devices.value.targetRevision}
          </h2>
          <DataTable
            locale={locale}
            dataSource={devices.value.items}
            rowKey="device"
            columns={[
              { title: l('终端', 'Endpoint'), dataIndex: 'device' },
              {
                title: l('已安装连接版本', 'Installed connection revision'),
                dataIndex: 'installedRevision',
              },
              { title: 'Origin', dataIndex: 'origin' },
              {
                title: l('接收时间', 'Received at'),
                dataIndex: 'receivedAt',
                render: (_, row) => timestamp(locale, row.receivedAt),
              },
            ]}
          />
          <Space wrap>
            <Button
              disabled={!after}
              onClick={() => setPage({ revision: devices.value!.targetRevision })}
            >
              {l('收敛首页', 'First convergence page')}
            </Button>
            <Button
              disabled={!devices.value.next}
              onClick={() => {
                if (devices.value?.next)
                  setPage({ revision: devices.value.targetRevision, after: devices.value.next })
              }}
            >
              {l('下一收敛页', 'Next convergence page')}
            </Button>
          </Space>
        </>
      )}
      <Button
        disabled={!configuration || action.busy}
        onClick={() => {
          delivery.clear()
          const ticket = delivery.capture()
          void action
            .run(async () => {
              const result = await agent.download()
              return {
                revision: result.document.configuration.revision,
                disclosed: delivery.deliver(result.file, ticket),
              }
            })
            .then((result) => {
              if (result.ok)
                setDownloadedRevision(result.value.disclosed ? result.value.revision : null)
            })
        }}
      >
        {l('准备下载连接恢复文件', 'Prepare connection recovery file')}
      </Button>
      {delivery.download && (
        <Space wrap>
          <a href={delivery.download.url} download={delivery.download.filename}>
            {l('保存连接恢复文件', 'Save connection recovery file')} · {downloadedRevision}
          </a>
          <Button onClick={delivery.clear}>{l('清除下载', 'Clear download')}</Button>
        </Space>
      )}
    </>
  )
}
