import { useId, useState } from 'react'
import { Alert, Button, Card, Descriptions, Form, Input } from 'antd'
import type { ViewEndpoint } from '@rss/mdm-devices'
import type {
  RecoveryOperation,
  AgentRequest,
  WindowsRequest,
  Page,
} from '@rss/mdm-enrollment/requests'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, labels, ReadState, useAction, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { DevicePkiRecovery } from './DevicePkiRecovery'
import { SelectionGuard, useSelectionGuard, usePendingSelection } from './SelectionGuard'
import { devicePermission } from './DeviceSecurity'
export function OriginalRequests({
  runtime,
  locale,
  endpoint,
}: {
  runtime: Runtime
  locale: Locale
  endpoint: ViewEndpoint
}) {
  const formId = useId(),
    selection = useSelectionGuard()
  usePendingSelection(selection.locked)
  const l = labels(locale),
    { requestHistory, devicePki, authorization, binding } = useAdministration(runtime),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState(''),
    [recoveryCursor, setRecoveryCursor] = useState<string | null>(null),
    action = useAction(),
    [receipt, setReceipt] = useState<{
      selection: string
      operation: RecoveryOperation
      value: unknown
    } | null>(null)
  const windows = endpoint.source === 'mdm.windows',
    device = endpoint.id,
    selectionKey = `${binding}/${device}/${selected}`
  const permission = useRead(`${binding}/original-requests-permission`, authorization.effective)
  const canRecover = devicePermission(permission.value?.grants ?? [], device, 'credentials')
  const page = useRead<Page<AgentRequest | WindowsRequest>>(
    `${binding}/original-requests/${device}/${windows}/${cursor}`,
    (signal) =>
      windows
        ? requestHistory.windows(device, cursor, signal)
        : requestHistory.agents(device, cursor, signal),
  )
  const detail = useRead<AgentRequest | WindowsRequest | null>(
    `${binding}/original-request/${device}/${windows}/${selected}`,
    (signal) =>
      selected
        ? windows
          ? requestHistory.windowsRequest(device, selected, signal)
          : requestHistory.agent(device, selected, signal)
        : Promise.resolve(null),
  )
  const recoveries = useRead(
    `${binding}/original-windows-recoveries/${device}/${selected}/${recoveryCursor}`,
    (signal) =>
      windows && selected
        ? requestHistory.windowsRecoveries(device, selected, recoveryCursor, signal)
        : Promise.resolve(null),
  )
  return (
    <SelectionGuard.Provider value={selection.register}>
      <Card title={l('原申请与恢复结果', 'Original requests and recovery results')}>
        <Alert
          type="info"
          title={l(
            '已关联、恢复已提交与设备领取/激活分别观察；缺少回执不能证明失败。',
            'Linkage, recovery submission and device collection/activation are separate observations; an absent receipt does not prove failure.',
          )}
        />
        {selection.locked && (
          <Alert
            type="warning"
            title={l(
              '原恢复操作尚未结束；请先处理原回执并明确结束，再切换申请。',
              'The original recovery is unfinished. Resolve its receipt and explicitly finish before selecting another request.',
            )}
          />
        )}
        <ReadState locale={locale} busy={page.busy} error={page.error} onRetry={page.reload} />
        {page.value && (
          <>
            <DataTable<AgentRequest | WindowsRequest>
              locale={locale}
              dataSource={page.value.items}
              rowKey={(row) => ('attempt' in row ? row.attempt : row.id)}
              columns={[
                {
                  title: l('原申请', 'Original request'),
                  render: (_, row) => {
                    const id = 'attempt' in row ? row.attempt : row.id
                    return (
                      <Button
                        type="link"
                        disabled={selection.locked}
                        onClick={() => {
                          setSelected(id)
                          setRecoveryCursor(null)
                          setReceipt(null)
                          action.clear()
                        }}
                      >
                        {id}
                      </Button>
                    )
                  },
                },
                { title: l('原操作', 'Original operation'), dataIndex: 'operationId' },
                {
                  title: l('要求', 'Requirements'),
                  render: (_, row) =>
                    row.requirements.map((value) => requirementText(value, locale)).join(' · ') ||
                    '—',
                },
                {
                  title: l('设备已激活', 'Device activated'),
                  render: (_, row) => String(row.activated),
                },
              ]}
            />
            {page.value.nextCursor && (
              <Button
                disabled={selection.locked}
                onClick={() => {
                  setSelected('')
                  setCursor(page.value!.nextCursor)
                }}
              >
                {l('下一页原申请', 'Next requests')}
              </Button>
            )}
            {cursor && (
              <Button
                disabled={selection.locked}
                onClick={() => {
                  setSelected('')
                  setCursor(null)
                }}
              >
                {l('原申请首页', 'First requests')}
              </Button>
            )}
          </>
        )}
        <ReadState
          locale={locale}
          busy={detail.busy}
          error={detail.error}
          onRetry={detail.reload}
        />
        {detail.value && (
          <Descriptions
            column={1}
            items={[
              {
                key: 'request',
                label: l('原申请', 'Original request'),
                children: 'attempt' in detail.value ? detail.value.attempt : detail.value.id,
              },
              {
                key: 'operation',
                label: l('原申请操作', 'Original request operation'),
                children: detail.value.operationId,
              },
              {
                key: 'state',
                label: l('申请 / 注册状态', 'Request / registration state'),
                children: `${'signing' in detail.value ? detail.value.signing.state : detail.value.state} / ${detail.value.registrationState ?? '—'}`,
              },
              {
                key: 'actor',
                label: l('原主体 / Instance', 'Original actor / instance'),
                children:
                  'actor' in detail.value
                    ? `${detail.value.actor ?? '—'} / ${detail.value.instance ?? '—'}`
                    : l('按恢复目录的精确主体读取', 'Read using the recovery directory identity'),
              },
              {
                key: 'signing',
                label: l('签发关联 / 签发者', 'Issuance link / issuer'),
                children:
                  'issuance' in detail.value
                    ? `${detail.value.issuance ?? '—'} / ${detail.value.issuanceState ?? '—'} / ${detail.value.issuer ?? '—'}`
                    : `${detail.value.signing.attempt} / ${detail.value.signing.issuer}`,
              },
              {
                key: 'predecessor',
                label: l('前序身份', 'Predecessor'),
                children: detail.value.predecessor ?? '—',
              },
              {
                key: 'activation',
                label: l('设备已激活', 'Device activated'),
                children: l(
                  detail.value.activated ? '是' : '否',
                  detail.value.activated ? 'Yes' : 'No',
                ),
              },
              {
                key: 'requirements',
                label: l('继续所需条件', 'Continuation requirements'),
                children:
                  detail.value.requirements
                    .map((value) => requirementText(value, locale))
                    .join(' · ') || '—',
              },
            ]}
          />
        )}
        <ReadState locale={locale} busy={recoveries.busy} error={recoveries.error} />
        {recoveries.value && (
          <>
            <DataTable<RecoveryOperation>
              locale={locale}
              rowKey={(row) => `${row.actor}/${row.instance}/${row.operationId}`}
              dataSource={recoveries.value.items}
              columns={[
                { title: l('原主体', 'Original actor'), dataIndex: 'actor' },
                { title: 'Instance', dataIndex: 'instance' },
                {
                  title: l('原恢复操作', 'Original recovery operation'),
                  render: (_, row: RecoveryOperation) => (
                    <Button
                      onClick={() =>
                        void action.run(async () =>
                          setReceipt({
                            selection: selectionKey,
                            operation: row,
                            value: await requestHistory.windowsRecovery(device, selected, row),
                          }),
                        )
                      }
                    >
                      {row.operationId}
                    </Button>
                  ),
                },
              ]}
            />
            {recoveries.value.nextCursor && (
              <Button onClick={() => setRecoveryCursor(recoveries.value!.nextCursor)}>
                {l('下一页恢复操作', 'Next recovery operations')}
              </Button>
            )}
          </>
        )}
        {!windows && selected && (
          <Form
            name={formId}
            layout="vertical"
            onFinish={(value: { operation: string; actor: string; instance: string }) =>
              void action.run(async () =>
                setReceipt({
                  selection: selectionKey,
                  operation: {
                    actor: value.actor,
                    instance: value.instance,
                    operationId: value.operation,
                  },
                  value: await devicePki.registrationRecovery(device, value.operation, {
                    actor: value.actor,
                    instance: value.instance,
                  }),
                }),
              )
            }
          >
            <Form.Item
              name="operation"
              label={l('原登记恢复操作 UUID', 'Original registration recovery operation UUID')}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="actor"
              label={l('原恢复主体', 'Original recovery actor')}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="instance"
              label={l('原恢复 Instance', 'Original recovery instance')}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Button htmlType="submit" disabled={action.busy}>
              {l('读取精确原回执', 'Read exact original receipt')}
            </Button>
          </Form>
        )}
        <Failure locale={locale} error={action.error} kind="read" />
        {receipt !== null && receipt.selection === selectionKey && (
          <pre className="definition-preview">{JSON.stringify(receipt, null, 2)}</pre>
        )}
        {!windows && detail.value && 'issuance' in detail.value && detail.value.issuance && (
          <DevicePkiRecovery
            key={selected}
            runtime={runtime}
            locale={locale}
            endpoint={endpoint}
            canRecover={canRecover}
            originalIssuance={detail.value.issuance}
          />
        )}
      </Card>
    </SelectionGuard.Provider>
  )
}

function requirementText(value: string, locale: Locale): string {
  if (locale === 'en') return value.replaceAll('_', ' ')
  return (
    (
      {
        awaiting_authorization: '等待授权',
        original_client_material: '需要原客户端材料',
        original_ca_response: '需要原 CA 响应',
        awaiting_device_activation: '等待设备激活',
        predecessor_unavailable: '前序身份不可用',
        awaiting_original_dispatch: '等待原签发投递',
        awaiting_native_continuation: '等待原生流程继续',
        awaiting_device_possession: '等待设备持钥确认',
        expired: '已过期',
        revoked: '已撤销',
        superseded: '已被替换',
      } as Record<string, string>
    )[value] ?? value
  )
}
