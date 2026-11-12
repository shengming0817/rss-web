import { useDirectoryQuery } from './directory-location'
import { DataTable } from './DataTable'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Button, Descriptions, Form, Input, Modal, Space, Switch } from 'antd'
import {
  validateKey,
  type ApiKey,
  type KeyIntent,
  type KeyMetadata,
  type KeyRow,
} from '@rss/mdm-authorization'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { GrantEditor } from './GrantEditor'
import { useAdministration } from './useAdministration'
import {
  CursorControls,
  fieldLabel,
  cellText,
  DirectoryControls,
  directoryQuery,
  Failure,
  isUnknown,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
type Props = { runtime: Runtime; locale: Locale }
function KeyEditor({
  runtime,
  locale,
  detail,
  id,
  done,
  beginDisclosure,
}: Props & {
  detail: ApiKey | null
  id: string
  done: (secret: string | null, generation: number) => void
  beginDisclosure: () => number
}) {
  const l = labels(locale),
    { authorization } = useAdministration(runtime),
    action = useAction()
  const [pending, setPending] = useState<{ operationId: string; intent: KeyIntent } | null>(null),
    [invalid, setInvalid] = useState(false)
  async function submit(operationId: string, intent: KeyIntent) {
    const generation = beginDisclosure()
    const result = await action.run(() => authorization.changeKey(operationId, intent))
    if (result.ok) done(result.value.secret, generation)
  }
  return (
    <>
      <Descriptions
        column={1}
        size="small"
        items={[
          { key: 'id', label: 'ID', children: id },
          { key: 'rev', label: l('版本', 'Revision'), children: detail?.revision ?? 0 },
        ]}
      />
      <Failure error={action.error} locale={locale} />
      {invalid && (
        <Alert
          type="error"
          title={l(
            '请检查名称、到期时间与可委派的权限。',
            'Check the name, expiry and delegable permissions.',
          )}
          role="alert"
        />
      )}
      <Form
        layout="vertical"
        disabled={pending !== null || action.busy || detail?.revoked === true}
        initialValues={
          detail
            ? {
                ...detail.metadata,
                expiry: detail.metadata.expiresAt
                  ? new Date(
                      detail.metadata.expiresAt * 1000 - new Date().getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : '',
              }
            : { name: '', enabled: true, expiry: '', grants: [] }
        }
        onFinish={(value: KeyMetadata & { expiry: string }) => {
          try {
            const metadata: KeyMetadata = {
              name: value.name,
              enabled: value.enabled,
              expiresAt: value.expiry ? Math.floor(new Date(value.expiry).getTime() / 1000) : null,
              grants: value.grants,
            }
            validateKey(metadata)
            const operationId = crypto.randomUUID(),
              intent: KeyIntent = {
                kind: detail ? 'update' : 'create',
                id,
                revision: detail?.revision ?? 0,
                metadata: structuredClone(metadata),
              }
            setInvalid(false)
            setPending({ operationId, intent })
            void submit(operationId, intent)
          } catch {
            setInvalid(true)
          }
        }}
      >
        <Form.Item name="name" label={l('名称', 'Name')} rules={[{ required: true }]}>
          <Input maxLength={1024} />
        </Form.Item>
        <Form.Item name="enabled" label={l('启用', 'Enabled')} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item
          name="expiry"
          label={l('到期时间（本地时间，可留空）', 'Expires at (local time, optional)')}
        >
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item name="grants" label={l('API Key 权限', 'API key permissions')} required>
          <GrantEditor realm="tenant" apiKey locale={locale} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={action.busy}>
          {detail ? l('保存 API Key', 'Save API key') : l('创建 API Key', 'Create API key')}
        </Button>
      </Form>
      {pending && (
        <div className="admin-recovery">
          <Alert
            type="info"
            title={l(
              '仅首次正式响应可能包含秘密；重提或回执不能恢复秘密。',
              'Only the initial response may contain the secret. Resubmission or a receipt cannot recover it.',
            )}
          />
          <code>{pending.operationId}</code>
          <Button
            disabled={action.busy}
            onClick={() => void submit(pending.operationId, pending.intent)}
          >
            {l('显式重提原请求', 'Resubmit original request')}
          </Button>
        </div>
      )}
    </>
  )
}
function Keys({ runtime, locale }: Props) {
  const l = labels(locale),
    { authorization, binding } = useAdministration(runtime),
    action = useAction()
  const [query, setQuery] = useDirectoryQuery('apiKeys.'),
    [id, setId] = useState<string | null>(null),
    [fresh, setFresh] = useState<string | null>(null)
  const [secret, setSecret] = useState<{
    binding: string
    value: string | null
    discarded: boolean
  } | null>(null)
  const disclosure = useRef(0)
  function clearDisclosure() {
    disclosure.current++
    setSecret(null)
  }
  function beginDisclosure() {
    clearDisclosure()
    return disclosure.current
  }
  const [confirm, setConfirm] = useState<{
    key: ApiKey
    kind: 'rotate' | 'revoke'
    operationId: string
  } | null>(null)
  const [pending, setPending] = useState(false)
  const fields: (keyof KeyRow)[] = [
    'id',
    'revision',
    'name',
    'enabled',
    'expiresAt',
    'revoked',
    'authorityRevision',
    'credentialRevision',
    'metadata',
    'createdBy',
    'createdAt',
  ]
  const page = useRead(`${binding}/keys/${JSON.stringify(query)}`, () =>
    authorization.keys(directoryQuery(query, fields)),
  )
  const detail = useRead(`${binding}/key/${id}`, () =>
    id ? authorization.key(id) : Promise.resolve(null),
  )
  useEffect(() => {
    const clear = () => {
      disclosure.current++
      flushSync(() => setSecret(null))
    }
    const hidden = () => {
      if (document.visibilityState !== 'visible') clear()
    }
    window.addEventListener('pagehide', clear)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      disclosure.current++
      window.removeEventListener('pagehide', clear)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [])
  const done = (value: string | null, generation: number) => {
    const allowed = generation === disclosure.current && document.visibilityState === 'visible'
    setId(null)
    setFresh(null)
    setSecret({ binding, value: allowed ? value : null, discarded: !allowed && value !== null })
    page.reload()
  }
  return (
    <>
      <div className="admin-section-actions">
        <Button type="primary" disabled={action.busy} onClick={() => setFresh(crypto.randomUUID())}>
          {l('创建 API Key', 'Create API key')}
        </Button>
        <Button onClick={page.reload}>{l('重新读取', 'Read again')}</Button>
      </div>
      <DirectoryControls catalog="apiKeys"
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={fields}
        sort={['id', 'revision', 'name', 'enabled', 'expiresAt', 'revoked', 'createdAt']}
      />
      <ReadState busy={page.busy} error={page.error} locale={locale} />
      {page.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="id"
            dataSource={[...page.value.items]}
            columns={[
              {
                title: 'API Key',
                dataIndex: 'id',
                render: (id: string, row) => (
                  <Button type="link" disabled={action.busy} onClick={() => setId(id)}>
                    {row.name ?? id}
                  </Button>
                ),
              },
              ...(['revision', 'enabled', 'revoked', 'expiresAt'] as const)
                .filter((f) => !query.fields || query.fields.includes(f))
                .map((field) => ({
                  title: fieldLabel(locale, field),
                  dataIndex: field,
                  render: (v: unknown) =>
                    field === 'expiresAt' && typeof v === 'number'
                      ? new Date(v * 1000).toLocaleString()
                      : cellText(locale, v),
                })),
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            onChange={setQuery}
            next={page.value.nextCursor}
            count={page.value.items.length}
          />
        </>
      )}
      <Modal
        open={id !== null || fresh !== null}
        title={l('API Key 详情', 'API key detail')}
        width={760}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        footer={null}
        onCancel={() => {
          clearDisclosure()
          setId(null)
          setFresh(null)
        }}
      >
        {fresh ? (
          <KeyEditor
            key={fresh}
            runtime={runtime}
            locale={locale}
            id={fresh}
            detail={null}
            done={done}
            beginDisclosure={beginDisclosure}
          />
        ) : (
          <>
            <ReadState busy={detail.busy} error={detail.error} locale={locale} />
            {detail.value && (
              <>
                <KeyEditor
                  key={`${detail.value.id}/${detail.value.revision}`}
                  runtime={runtime}
                  locale={locale}
                  id={detail.value.id}
                  detail={detail.value}
                  done={done}
                  beginDisclosure={beginDisclosure}
                />
                <Space className="admin-section-actions">
                  <Button
                    disabled={detail.value.revoked}
                    onClick={() => {
                      setConfirm({
                        key: detail.value!,
                        kind: 'rotate',
                        operationId: crypto.randomUUID(),
                      })
                      setPending(false)
                    }}
                  >
                    {l('轮换秘密', 'Rotate secret')}
                  </Button>
                  <Button
                    danger
                    disabled={detail.value.revoked}
                    onClick={() => {
                      setConfirm({
                        key: detail.value!,
                        kind: 'revoke',
                        operationId: crypto.randomUUID(),
                      })
                      setPending(false)
                    }}
                  >
                    {l('撤销 API Key', 'Revoke API key')}
                  </Button>
                </Space>
              </>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={secret !== null && secret.binding === binding}
        title={l('API Key 操作已确认', 'API key operation confirmed')}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        onCancel={clearDisclosure}
        footer={<Button onClick={clearDisclosure}>{l('已保存，关闭', 'Saved, close')}</Button>}
      >
        {secret?.binding === binding &&
          (secret.value !== null ? (
            <>
              <Alert
                type="warning"
                title={l(
                  '秘密仅本次展示。离开、隐藏或关闭后无法再次读取。',
                  'The secret is shown once. Leaving, hiding or closing discards it.',
                )}
              />
              <code className="api-secret">{secret.value}</code>
            </>
          ) : (
            <Alert
              type="info"
              title={
                secret.discarded
                  ? l(
                      '操作已确认，秘密披露已因隐藏或关闭失效。需要新秘密时请显式轮换。',
                      'Operation confirmed. Hiding or closing invalidated secret disclosure. Explicitly rotate if a new secret is needed.',
                    )
                  : l(
                      '本次响应不包含秘密。回执不能恢复先前秘密；需要新秘密时请显式轮换。',
                      'This response contains no secret. A receipt cannot recover a previous secret; explicitly rotate if needed.',
                    )
              }
            />
          ))}
      </Modal>
      <Modal
        open={confirm !== null}
        title={
          confirm?.kind === 'revoke'
            ? l('撤销 API Key？', 'Revoke API key?')
            : l('轮换 API Key 秘密？', 'Rotate API key secret?')
        }
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        confirmLoading={action.busy}
        okButtonProps={{ danger: confirm?.kind === 'revoke' }}
        okText={pending ? l('显式重提原请求', 'Resubmit original request') : l('确认', 'Confirm')}
        onCancel={() => {
          clearDisclosure()
          setConfirm(null)
          action.clear()
        }}
        onOk={() => {
          if (!confirm) return
          const generation = beginDisclosure()
          setPending(true)
          void action
            .run(() =>
              authorization.changeKey(confirm.operationId, {
                kind: confirm.kind,
                id: confirm.key.id,
                revision: confirm.key.revision,
              }),
            )
            .then((r) => {
              if (r.ok) {
                setConfirm(null)
                done(r.value.secret, generation)
              }
            })
        }}
      >
        <Failure error={action.error} locale={locale} />
        <p>{l('此操作会使现有秘密失效。', 'This invalidates the current secret.')}</p>
        {confirm && <code>{confirm.operationId}</code>}
      </Modal>
    </>
  )
}
function Network({ runtime, locale }: Props) {
  const l = labels(locale),
    { authorization, binding } = useAdministration(runtime),
    action = useAction()
  const read = useRead(`${binding}/network-policy`, authorization.network)
  const [pending, setPending] = useState<{
    operationId: string
    expectedRevision: number
    networks: readonly string[]
  } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const rejected = pending !== null && action.error !== null && !isUnknown(action.error)
  async function submit() {
    if (!pending) return
    const result = await action.run(() =>
      authorization.changeNetwork(pending.operationId, pending.expectedRevision, pending.networks),
    )
    if (result.ok) {
      setPending(null)
      setConfirm(false)
      read.reload()
    }
  }
  return (
    <>
      <Alert
        type="info"
        title={l(
          '此策略限定程序 API Key 可使用的源网络。空列表会拒绝全部程序访问。',
          'This policy restricts source networks for programmatic API keys. An empty list denies all programmatic access.',
        )}
      />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      <Button onClick={read.reload} disabled={action.busy || pending !== null}>
        {l('读取网络策略', 'Read network policy')}
      </Button>
      {read.value && (
        <Form
          key={read.value.revision}
          layout="vertical"
          disabled={action.busy || pending !== null}
          initialValues={{ networks: read.value.networks.join('\n') }}
          onFinish={(value: { networks: string }) => {
            setPending({
              operationId: crypto.randomUUID(),
              expectedRevision: read.value!.revision,
              networks: value.networks.split(/\s+/).filter(Boolean),
            })
            setConfirm(true)
          }}
        >
          <p className="subtitle">revision {read.value.revision}</p>
          <Form.Item
            name="networks"
            label={l('CIDR 网络，每行一个', 'CIDR networks, one per line')}
          >
            <Input.TextArea rows={8} maxLength={33024} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            {l('更新网络策略', 'Update network policy')}
          </Button>
        </Form>
      )}
      {pending && !confirm && (
        <Button onClick={() => setConfirm(true)}>
          {l('显式重提原请求', 'Resubmit original request')}
        </Button>
      )}
      {rejected && (
        <Button
          disabled={action.busy}
          onClick={() => {
            setPending(null)
            setConfirm(false)
            action.clear()
            read.reload()
          }}
        >
          {l('放弃已拒绝请求并读取最新版本', 'Discard rejected request and read latest version')}
        </Button>
      )}
      <Modal
        open={confirm}
        title={
          pending?.networks.length
            ? l('更新网络策略？', 'Update network policy?')
            : l('拒绝全部程序 API 访问？', 'Deny all programmatic API access?')
        }
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        confirmLoading={action.busy}
        onOk={() => void submit()}
        onCancel={() => {
          setConfirm(false)
          if ((!action.error || rejected) && !action.busy) setPending(null)
        }}
      >
        <Failure error={action.error} locale={locale} />
        <p>
          {l(
            '服务端将校验并规范化网络。保存使用当前版本，冲突不会自动重放。',
            'The server validates and normalizes networks. Saving uses the current revision; conflicts are never automatically replayed.',
          )}
        </p>
        {pending && <code>{pending.operationId}</code>}
      </Modal>
    </>
  )
}
export function ApiAccess(props: Props) {
  return props.runtime.management ? <Network {...props} /> : <Keys {...props} />
}
