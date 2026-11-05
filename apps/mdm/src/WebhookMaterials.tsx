import type { WebhookMaterialRecovery } from './webhook-material-recovery'
import { useEffect, useId, useRef, useState } from 'react'
import { Alert, Button, Card, Form, Input, Space } from 'antd'
import { useSearchParams } from 'react-router-dom'
import type { Material, MaterialOperation, Webhooks } from '@rss/mdm-webhooks'
import type { Locale } from './i18n'
import { Failure, labels, ReadState, useAction, useRead } from './AdminUi'
import { DataTable } from './DataTable'
import { Status } from './DevicePresentation'
import { SecretPanel } from './SecretTabs'
import { WebhookMaterialAuthor } from './WebhookMaterialAuthor'
import { WebhookMaterialFacts } from './WebhookMaterialFacts'

export function WebhookMaterials({
  webhooks,
  binding,
  authority,
  locale,
  canRead,
  canWrite,
  blocked,
  materialRecovery,
  canReauthenticate,
}: {
  webhooks: Webhooks
  binding: string
  authority: string
  locale: Locale
  canRead: boolean
  canWrite: boolean
  blocked: boolean
  materialRecovery: WebhookMaterialRecovery
  canReauthenticate: boolean
}) {
  const l = labels(locale),
    prefix = useId(),
    [params, setParams] = useSearchParams(),
    reference = params.get('reference') ?? '',
    read = useRead(`${binding}/${authority}/${canRead}/webhook-materials`, async () => {
      if (!canRead) throw { code: 'forbidden', status: 403 }
      return webhooks.materials()
    }),
    [entered, setEntered] = useState(() => materialRecovery.available(binding)),
    [editing, setEditing] = useState(() => materialRecovery.available(binding)),
    [selected, setSelected] = useState<Material | null>(null),
    [record, setRecord] = useState<MaterialOperation | null>(null),
    lookup = useAction(),
    epoch = useRef(0),
    [form] = Form.useForm<{ operationId: string }>()
  useEffect(() => {
    epoch.current++
    setSelected(null)
    setRecord(null)
    form.resetFields()
  }, [binding, authority, canRead, form])
  useEffect(
    () => () => {
      epoch.current++
    },
    [],
  )
  useEffect(() => {
    if (!canWrite && !canRead) setEditing(false)
  }, [canWrite, canRead])
  function reload() {
    setSelected(null)
    read.reload()
  }
  function chooseReference(reference: string) {
    if (blocked) return
    const next = new URLSearchParams(params)
    next.set('reference', reference)
    setParams(next)
    setSelected(null)
  }
  const directory = canRead && !read.error ? read.value : undefined,
    materials =
      directory?.materials.filter((material) => !reference || material.reference === reference) ??
      []
  return (
    <>
      <Space wrap>
        <Button disabled={!canRead} onClick={reload}>
          {l('读取签名材料目录', 'Read signing material directory')}
        </Button>
        <Button
          type="primary"
          disabled={entered ? !canRead && !canWrite : !canWrite || blocked}
          onClick={() => {
            setEntered(true)
            setEditing(true)
          }}
        >
          {l(
            entered ? '返回材料任务' : '管理签名材料',
            entered ? 'Return to material task' : 'Manage signing material',
          )}
        </Button>
        {reference && (
          <>
            <span>
              {l('当前签名引用', 'Current signing reference')} · <code>{reference}</code>
            </span>
            <Button
              disabled={blocked}
              onClick={() => {
                const next = new URLSearchParams(params)
                next.delete('reference')
                setParams(next)
                setSelected(null)
              }}
            >
              {l('清除材料范围', 'Clear material scope')}
            </Button>
          </>
        )}
      </Space>
      <Alert
        type="info"
        title={l(
          '此目录只含公开材料元数据。服务端生成的密钥没有浏览器导出端点；宿主负责私密交付和接收端持钥确认。',
          'This directory contains public material metadata only. Server-generated keys have no browser export endpoint; the host owns private delivery and receiver key possession confirmation.',
        )}
      />
      {entered && (
        <SecretPanel active={editing && (canRead || canWrite)}>
          <fieldset
            className="permission-panel"
            hidden={!editing || (!canRead && !canWrite)}
            disabled={!canRead && !canWrite}
          >
            <WebhookMaterialAuthor
              webhooks={webhooks}
              materialRecovery={materialRecovery}
              binding={binding}
              canReauthenticate={canReauthenticate}
              directory={directory}
              reference={reference}
              locale={locale}
              canRead={canRead}
              canWrite={canWrite}
              blocked={blocked}
              onChanged={reload}
              onClose={() => setEditing(false)}
            />
          </fieldset>
        </SecretPanel>
      )}
      {canRead ? (
        <>
          <ReadState busy={read.busy} error={read.error} locale={locale} />
          {directory && (
            <>
              <Card title={l('材料 head', 'Material heads')}>
                <DataTable
                  locale={locale}
                  rowKey="reference"
                  dataSource={directory.heads.filter(
                    (head) => !reference || head.reference === reference,
                  )}
                  columns={[
                    {
                      title: l('签名引用', 'Signing reference'),
                      render: (_, head) => (
                        <Button
                          type="link"
                          disabled={blocked}
                          onClick={() => chooseReference(head.reference)}
                        >
                          {head.reference}
                        </Button>
                      ),
                    },
                    { title: l('head CAS 版本', 'Head CAS revision'), dataIndex: 'revision' },
                    { title: l('签名版本', 'Signing revision'), dataIndex: 'activeRevision' },
                    { title: l('退役旧版本', 'Retiring revision'), dataIndex: 'retiringRevision' },
                  ]}
                />
              </Card>
              <Card title={l('材料版本', 'Material revisions')}>
                <DataTable
                  locale={locale}
                  rowKey={(material) => material.reference + '/' + material.revision}
                  dataSource={materials}
                  columns={[
                    { title: l('签名引用', 'Signing reference'), dataIndex: 'reference' },
                    {
                      title: l('材料版本', 'Material revision'),
                      render: (_, material) => (
                        <Button type="link" onClick={() => setSelected(material)}>
                          {material.revision}
                        </Button>
                      ),
                    },
                    {
                      title: l('持钥确认', 'Key possession'),
                      render: (_, material) => (
                        <Status
                          value={material.confirmed ? 'confirmed' : 'unconfirmed'}
                          locale={locale}
                        />
                      ),
                    },
                    {
                      title: l('撤销', 'Revocation'),
                      render: (_, material) =>
                        material.revoked ? (
                          <Status value="revoked" locale={locale} />
                        ) : (
                          l('未撤销', 'Not revoked')
                        ),
                    },
                  ]}
                />
                {selected && (
                  <>
                    <Button onClick={() => setSelected(null)}>
                      {l('关闭材料详情', 'Close material detail')}
                    </Button>
                    <WebhookMaterialFacts value={selected} locale={locale} />
                  </>
                )}
              </Card>
            </>
          )}
          <details>
            <summary>{l('读取已知材料原操作', 'Read a known material operation')}</summary>
            <p className="subtitle">
              {l(
                '独立查询仅显示已记录回执，不推断它与任何未提供的原输入相符。',
                'This independent lookup displays the recorded receipt without claiming a match to unspecified original inputs.',
              )}
            </p>
            <Form
              name={prefix + '-lookup'}
              form={form}
              layout="vertical"
              onFinish={(value) => {
                const generation = ++epoch.current
                setRecord(null)
                void lookup
                  .run(() => webhooks.materialOperation(value.operationId))
                  .then((result) => {
                    if (result.ok && generation === epoch.current) setRecord(result.value)
                  })
              }}
            >
              <Form.Item
                name="operationId"
                label={l('已知材料操作 UUID', 'Known material operation UUID')}
                rules={[{ required: true }]}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Button htmlType="submit" disabled={lookup.busy || !canRead}>
                {l('查询材料原操作', 'Look up material operation')}
              </Button>
            </Form>
            <Failure error={lookup.error} locale={locale} kind="read" />
            {record && <WebhookMaterialFacts value={record} locale={locale} />}
          </details>
        </>
      ) : (
        <Alert
          type="info"
          title={l(
            '材料目录和原操作查询需要 Webhook 读取权限；已保留的原写入仍需写权限才能重提。',
            'Material directory and original-operation reads require WebhookRead; resubmitting a retained write requires WebhookWrite.',
          )}
        />
      )}
    </>
  )
}
