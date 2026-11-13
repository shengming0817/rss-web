import { useState } from 'react'
import { Alert, Button, Card } from 'antd'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { labels, ReadState, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DiagnosticReference } from './DiagnosticReference'
import { DataTable } from './DataTable'
export function DeviceDeclarations({
  runtime,
  locale,
  device,
}: {
  runtime: Runtime
  locale: Locale
  device: string
}) {
  const l = labels(locale),
    { execution, binding } = useAdministration(runtime),
    [cursor, setCursor] = useState<string | null>(null)
  const read = useRead(`${binding}/device-ddm/${device}/${cursor}`, (signal) =>
    execution.declarations(device, cursor, signal),
  )
  return (
    <Card title={l('DDM 声明与原生状态', 'DDM declarations and native status')}>
      <Alert
        type="info"
        title={l(
          '发布或同步不证明设备设置生效、合规或已卸载。',
          'Publication or synchronization does not prove applied settings, compliance or removal.',
        )}
      />
      <ReadState locale={locale} busy={read.busy} error={read.error} onRetry={read.reload} />
      {read.value && (
        <>
          <p>
            {l('当前注册', 'Current registration')} · {read.value.availability} ·{' '}
            {read.value.effect} / {read.value.compliance}
          </p>
          <DataTable
            locale={locale}
            dataSource={read.value.items}
            rowKey={(row) => `${row.operationId}/${row.userKey}`}
            columns={[
              {
                title: l('原操作', 'Original operation'),
                render: (_, row) => (
                  <DiagnosticReference
                    locale={locale}
                    context="mdm"
                    selection={{
                      mode: 'operation',
                      address: {
                        owner: 'installation',
                        operationId: row.operationId,
                        device,
                      },
                    }}
                  />
                ),
              },
              {
                title: l('通道 / 用户范围', 'Channel / user scope'),
                render: (_, row) => `${row.channel} / ${row.userKey || l('设备', 'Device')}`,
              },
              {
                title: l('发布 / 进度', 'Publication / progress'),
                render: (_, row) =>
                  `${row.observation.synchronization} / ${row.observation.progress}`,
              },
              {
                title: l('输入版本', 'Input version'),
                render: (_, row) => row.observation.inputVersion ?? '—',
              },
              {
                title: l('原生值已脱敏', 'Native values redacted'),
                render: (_, row) => String(row.nativeValuesRedacted),
              },
              {
                title: l(
                  'ServerToken、声明与原生观察',
                  'ServerToken, declarations and native observations',
                ),
                render: (_, row) => (
                  <details>
                    <summary>{l('查看原生观察', 'View native observation')}</summary>
                    <pre className="public-json">{JSON.stringify(row.observation, null, 2)}</pre>
                  </details>
                ),
              },
            ]}
          />
          {read.value.items.map((item) => (
            <section key={`${item.operationId}/${item.userKey}`}>
              <h3>
                {item.operationId} · {item.userKey || l('设备通道', 'Device channel')}
              </h3>
              {item.observation.nativeStatus ? (
                <DataTable
                  locale={locale}
                  rowKey="identifier"
                  dataSource={item.observation.nativeStatus.declarations}
                  columns={[
                    { title: l('声明', 'Declaration'), dataIndex: 'identifier' },
                    { title: 'ServerToken', dataIndex: 'serverToken' },
                    {
                      title: l('原生活跃 / 有效性', 'Native active / validity'),
                      render: (_, row) =>
                        `${row.native.active === null ? l('未知', 'Unknown') : String(row.native.active)} / ${row.native.valid}`,
                    },
                    {
                      title: l('原生原因', 'Native reasons'),
                      render: (_, row) => JSON.stringify(row.native.reasons),
                    },
                  ]}
                />
              ) : (
                <p>
                  {l(
                    '没有原生状态观察；不能推断已生效。',
                    'No native status observation; application cannot be inferred.',
                  )}
                </p>
              )}
            </section>
          ))}
          {read.value.nextCursor && (
            <Button onClick={() => setCursor(read.value!.nextCursor)}>
              {l('下一页声明', 'Next declarations')}
            </Button>
          )}
          {cursor && (
            <Button onClick={() => setCursor(null)}>{l('声明首页', 'First declarations')}</Button>
          )}
        </>
      )}
    </Card>
  )
}
