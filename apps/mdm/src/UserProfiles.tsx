import { DataTable } from './DataTable'
import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
} from 'antd'
import {
  nextProfileExpiry,
  prepareDefinition,
  validateDefinition,
  valueTypes,
  visibleProfile,
  type Definition,
  type DefinitionChange,
  type DefinitionRow,
  type DefinitionValue,
  type Profile,
  type SourceMetadata,
} from '@rss/mdm-user-profiles'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { useAdministration } from './useAdministration'
import {
  CursorControls,
  fieldLabel,
  cellText,
  DirectoryControls,
  directoryQuery,
  Failure,
  Heading,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
type Props = { runtime: Runtime; locale: Locale }
function DefinitionEditor({
  runtime,
  locale,
  detail,
  sources,
  done,
}: Props & { detail: Definition; sources: readonly SourceMetadata[]; done: () => void }) {
  const l = labels(locale),
    { profiles } = useAdministration(runtime),
    action = useAction(),
    [form] = Form.useForm<DefinitionValue & { sourceId: string }>()
  const [pending, setPending] = useState<DefinitionChange | null>(null),
    [invalid, setInvalid] = useState(false)
  const valueType = Form.useWatch('valueType', form) ?? detail.value?.valueType ?? 'string'
  const sourceId =
    Form.useWatch('sourceId', form) ??
    (detail.value?.source.kind === 'idp' ? detail.value.source.provider : 'identity_local')
  const currentSource = sources.find((s) =>
    s.source.kind === 'idp' ? s.source.provider === sourceId : sourceId === 'identity_local',
  )
  const sourceOptions = sources.map((s) => ({
    value: s.source.kind === 'idp' ? s.source.provider : 'identity_local',
    label:
      s.source.kind === 'idp'
        ? `IdP · ${s.source.provider}`
        : l('Identity 本地资料', 'Identity local profile'),
  }))
  if (!sourceOptions.some((s) => s.value === sourceId))
    sourceOptions.push({
      value: sourceId,
      label: `${sourceId} · ${l('当前来源不可用', 'Source unavailable')}`,
    })
  async function submit(change: DefinitionChange) {
    const r = await action.run(() => profiles.save(change))
    if (r.ok) done()
  }
  return (
    <>
      <p className="subtitle">
        {detail.fieldId} · revision {detail.revision}
      </p>
      <Failure error={action.error} locale={locale} />
      {invalid && (
        <Alert
          type="error"
          title={l(
            '请检查字段键、指针、值类型和约束。',
            'Check the field key, pointer, value type and constraints.',
          )}
          role="alert"
        />
      )}
      {detail.revision > 0 && detail.value === null ? (
        <Alert
          type="warning"
          title={l(
            '字段已删除，请用新标识重新创建。',
            'This field is deleted. Recreating requires a fresh ID.',
          )}
        />
      ) : (
        <Form
          form={form}
          layout="vertical"
          disabled={action.busy || pending !== null}
          initialValues={
            detail.value
              ? {
                  ...detail.value,
                  sourceId:
                    detail.value.source.kind === 'idp'
                      ? detail.value.source.provider
                      : 'identity_local',
                }
              : {
                  key: '',
                  displayName: '',
                  sourceId: 'identity_local',
                  pointer: '/extensions/',
                  valueType: 'string',
                  maxLength: null,
                  maxItems: null,
                  minimum: null,
                  maximum: null,
                  enabled: true,
                  sensitive: false,
                  visibility: 'both',
                  displayUse: 'profile',
                  required: false,
                  useExistingObservation: false,
                }
          }
          onFinish={(v) => {
            try {
              const value: DefinitionValue = {
                key: v.key,
                displayName: v.displayName,
                source:
                  v.sourceId === 'identity_local'
                    ? { kind: 'identity_local' }
                    : { kind: 'idp', provider: v.sourceId },
                pointer: v.pointer ?? '',
                valueType: v.valueType,
                maxLength: v.valueType === 'string' ? (v.maxLength ?? null) : null,
                maxItems:
                  v.valueType === 'array' || v.valueType === 'object' ? (v.maxItems ?? null) : null,
                minimum:
                  v.valueType === 'number' || v.valueType === 'integer'
                    ? (v.minimum ?? null)
                    : null,
                maximum:
                  v.valueType === 'number' || v.valueType === 'integer'
                    ? (v.maximum ?? null)
                    : null,
                enabled: v.enabled,
                sensitive: v.sensitive,
                required: v.required,
                visibility: v.visibility,
                displayUse: v.displayUse,
                useExistingObservation: v.useExistingObservation,
              }
              validateDefinition(value)
              const operationId = crypto.randomUUID(),
                change = detail.revision
                  ? prepareDefinition(operationId, detail, value)
                  : { fieldId: detail.fieldId, operationId, expectedRevision: 0, value }
              setInvalid(false)
              setPending(change)
              void submit(change)
            } catch {
              setInvalid(true)
            }
          }}
        >
          <div className="admin-form-grid">
            <Form.Item
              name="key"
              label={l('字段键', 'Field key')}
              rules={[{ required: true }, { pattern: /^[A-Za-z][A-Za-z0-9_]{0,63}$/ }]}
            >
              <Input maxLength={64} />
            </Form.Item>
            <Form.Item
              name="displayName"
              label={l('显示名称', 'Display name')}
              rules={[{ required: true }]}
            >
              <Input maxLength={256} />
            </Form.Item>
            <Form.Item name="sourceId" label={l('资料来源', 'Profile source')}>
              <Select options={sourceOptions} />
            </Form.Item>
            <Form.Item
              name="pointer"
              label={l('JSON Pointer（标准化资料）', 'JSON Pointer (normalized profile)')}
            >
              <Input maxLength={1024} placeholder="/extensions/…" />
            </Form.Item>
            <Form.Item name="valueType" label={l('值类型', 'Value type')}>
              <Select options={valueTypes.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
            {valueType === 'string' && (
              <Form.Item name="maxLength" label={l('最大字节数', 'Maximum bytes')}>
                <InputNumber min={1} max={65536} />
              </Form.Item>
            )}
            {(valueType === 'array' || valueType === 'object') && (
              <Form.Item name="maxItems" label={l('最大项数', 'Maximum items')}>
                <InputNumber min={1} max={valueType === 'array' ? 128 : 256} />
              </Form.Item>
            )}
            {(valueType === 'number' || valueType === 'integer') && (
              <>
                <Form.Item name="minimum" label={l('最小值', 'Minimum')}>
                  <InputNumber />
                </Form.Item>
                <Form.Item name="maximum" label={l('最大值', 'Maximum')}>
                  <InputNumber />
                </Form.Item>
              </>
            )}
            <Form.Item name="visibility" label={l('可见范围', 'Visibility')}>
              <Select
                options={[
                  { value: 'self', label: l('本人', 'Self') },
                  { value: 'profiles_read', label: l('有资料读取权限者', 'Profiles readers') },
                  { value: 'both', label: l('两者', 'Both') },
                ]}
              />
            </Form.Item>
            <Form.Item name="displayUse" label={l('显示用途', 'Display use')}>
              <Select
                options={[
                  { value: 'profile', label: l('资料详情', 'Profile detail') },
                  { value: 'summary', label: l('摘要', 'Summary') },
                  { value: 'hidden', label: l('隐藏展示', 'Hidden presentation') },
                ]}
              />
            </Form.Item>
            <Form.Item name="enabled" label={l('启用', 'Enabled')} valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item
              name="sensitive"
              label={l('敏感字段', 'Sensitive field')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="required"
              label={l('完整性必需', 'Required for completeness')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="useExistingObservation"
              label={l('显式允许使用既有观察', 'Explicitly allow existing observations')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </div>
          <Alert
            type="info"
            title={l(
              '完整性不阻止登录；隐藏不是授权边界。映射变化默认等待新观察，允许既有观察需要显式选择。',
              'Completeness does not block login; hiding is not authorization. Mapping changes normally wait for new observations; reusing existing observations is explicit.',
            )}
          />
          <p className="subtitle">
            {l('来源扩展声明根', 'Source extensions claim')}: {currentSource?.extensionsRoot ?? '—'}{' '}
            · {l('最长观察时限', 'Maximum observation age')}: {currentSource?.maxAgeSeconds ?? '—'}s
          </p>
          <Button type="primary" htmlType="submit" loading={action.busy}>
            {l('保存用户字段', 'Save user field')}
          </Button>
        </Form>
      )}
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          <Space>
            <Button
              disabled={action.busy}
              onClick={() =>
                void action
                  .run(() => profiles.operation(pending.operationId))
                  .then((r) => {
                    if (
                      r.ok &&
                      r.value.definition.fieldId === pending.fieldId &&
                      r.value.definition.revision === pending.expectedRevision + 1 &&
                      (r.value.definition.value === null) === (pending.value === null)
                    )
                      done()
                  })
              }
            >
              {l('查询原字段操作', 'Read original field operation')}
            </Button>
            <Button disabled={action.busy} onClick={() => void submit(pending)}>
              {l('显式重提原请求', 'Resubmit original request')}
            </Button>
          </Space>
        </div>
      )}
    </>
  )
}
function Definitions(props: Props) {
  const { runtime, locale } = props,
    l = labels(locale),
    { profiles, binding } = useAdministration(runtime),
    action = useAction()
  const [query, setQuery] = useState<Query>({ limit: 20 }),
    [id, setId] = useState<string | null>(null),
    [fresh, setFresh] = useState<Definition | null>(null)
  const [deleting, setDeleting] = useState<Definition | null>(null),
    [pending, setPending] = useState<DefinitionChange | null>(null)
  const fields: (keyof DefinitionRow)[] = [
    'fieldId',
    'revision',
    'collectedAfterMicros',
    'value',
    'key',
    'displayName',
    'sourceKind',
    'provider',
    'valueType',
    'enabled',
    'sensitive',
    'required',
    'visibility',
    'displayUse',
  ]
  const page = useRead(`${binding}/definitions/${JSON.stringify(query)}`, () =>
    profiles.definitions(directoryQuery(query, fields)),
  )
  const detail = useRead(`${binding}/definition/${id}`, () =>
    id ? profiles.definition(id) : Promise.resolve(null),
  )
  const done = () => {
    setId(null)
    setFresh(null)
    page.reload()
  }
  return (
    <>
      <div className="admin-section-actions">
        <Button
          type="primary"
          disabled={!page.value}
          onClick={() =>
            setFresh({
              fieldId: crypto.randomUUID(),
              revision: 0,
              value: null,
              collectedAfterMicros: 0,
            })
          }
        >
          {l('创建用户字段', 'Create user field')}
        </Button>
        <Button onClick={page.reload}>{l('重新读取', 'Read again')}</Button>
      </div>
      <DirectoryControls
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={fields}
        required="fieldId"
        maximum={128}
        sort={[
          'fieldId',
          'revision',
          'key',
          'displayName',
          'sourceKind',
          'provider',
          'valueType',
          'enabled',
          'sensitive',
          'required',
          'visibility',
          'displayUse',
        ]}
      />
      <ReadState busy={page.busy} error={page.error} locale={locale} />
      {page.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="fieldId"
            dataSource={[...page.value.items]}
            columns={[
              {
                title: l('用户字段', 'User field'),
                dataIndex: 'fieldId',
                render: (id: string, row) => (
                  <Button type="link" onClick={() => setId(id)}>
                    {row.displayName ?? id}
                  </Button>
                ),
              },
              ...(['key', 'sourceKind', 'valueType', 'revision', 'enabled', 'required'] as const)
                .filter((f) => !query.fields || query.fields.includes(f))
                .map((field) => ({
                  title: fieldLabel(locale, field),
                  dataIndex: field,
                  render: (v: unknown) => cellText(locale, v),
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
        title={l('用户字段详情', 'User field detail')}
        width={840}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        footer={null}
        onCancel={() => {
          setId(null)
          setFresh(null)
        }}
      >
        {fresh ? (
          <DefinitionEditor
            key={fresh.fieldId}
            {...props}
            detail={fresh}
            sources={page.value?.sources ?? []}
            done={done}
          />
        ) : (
          <>
            <ReadState busy={detail.busy} error={detail.error} locale={locale} />
            {detail.value && (
              <>
                <DefinitionEditor
                  key={`${detail.value.fieldId}/${detail.value.revision}`}
                  {...props}
                  detail={detail.value}
                  sources={page.value?.sources ?? []}
                  done={done}
                />
                {detail.value.value && (
                  <Button
                    danger
                    onClick={() => {
                      setDeleting(detail.value!)
                      setPending(null)
                    }}
                  >
                    {l('删除字段', 'Delete field')}
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={deleting !== null}
        title={l('删除用户字段？', 'Delete user field?')}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        confirmLoading={action.busy}
        okButtonProps={{ danger: true }}
        okText={
          pending ? l('显式重提原请求', 'Resubmit original request') : l('删除字段', 'Delete field')
        }
        onCancel={() => {
          setDeleting(null)
          setPending(null)
          action.clear()
        }}
        onOk={() => {
          if (!deleting) return
          const change = pending ?? prepareDefinition(crypto.randomUUID(), deleting, null)
          setPending(change)
          void action
            .run(() => profiles.save(change))
            .then((r) => {
              if (r.ok) {
                setDeleting(null)
                setId(null)
                page.reload()
              }
            })
        }}
      >
        <Failure error={action.error} locale={locale} />
        <p>
          {l(
            '删除会留下永久墓碑，不能用原标识重新创建。',
            'Deletion leaves a permanent tombstone. Recreating requires a fresh ID.',
          )}
        </p>
        {pending && (
          <>
            <code>{pending.operationId}</code>
            <Button
              disabled={action.busy}
              onClick={() =>
                void action
                  .run(() => profiles.operation(pending.operationId))
                  .then((r) => {
                    if (
                      r.ok &&
                      r.value.definition.fieldId === pending.fieldId &&
                      r.value.definition.revision === pending.expectedRevision + 1 &&
                      r.value.definition.value === null
                    ) {
                      setDeleting(null)
                      done()
                    }
                  })
              }
            >
              {l('查询原字段操作', 'Read original field operation')}
            </Button>
          </>
        )}
      </Modal>
    </>
  )
}
function Projection({ profile, locale }: { profile: Profile; locale: Locale }) {
  const l = labels(locale),
    [now, setNow] = useState(() => Date.now() / 1000)
  const visible = visibleProfile(profile, Math.max(now, Date.now() / 1000))
  const expiry = nextProfileExpiry(visible.profile)
  useEffect(() => {
    setNow(Date.now() / 1000)
    if (expiry === null) return
    const timer = setTimeout(
      () => setNow(Date.now() / 1000),
      Math.min(Math.max(0, Math.ceil(expiry * 1000 - Date.now()) + 1), 2_147_483_647),
    )
    return () => clearTimeout(timer)
  }, [profile, expiry])
  // Date.now also prevents rendering expired values before the timer effect runs.
  const c = visible.profile.completeness
  const statuses = {
    available: l('可用', 'Available'),
    missing: l('缺失', 'Missing'),
    expired: l('已过期', 'Expired'),
    unavailable: l('不可用', 'Unavailable'),
    pending_login: l('等待新登录观察', 'Waiting for a new login observation'),
    invalid: l('值无效', 'Invalid'),
    not_configured: l('未配置', 'Not configured'),
    redacted: l('已脱敏', 'Redacted'),
  }
  return (
    <>
      <Alert
        type={visible.completenessStale || c.missing > 0 ? 'warning' : 'info'}
        title={
          visible.completenessStale
            ? l(
                '观察已过期；原完整性计数不再代表当前状态，请重新读取。',
                'Observations expired. The previous completeness counts are stale; read again.',
              )
            : `${l('完整性', 'Completeness')}: ${c.complete} / ${c.required} · ${l('缺失', 'Missing')}: ${c.missing}`
        }
      />
      <p className="subtitle">
        {profile.principalId} ·{' '}
        {profile.view === 'current'
          ? l('当前登录观察，不回退到 latest', 'Current login observation, without latest fallback')
          : l(
              '最新展示投影，不是认证事实',
              'Latest display projection, not an authentication fact',
            )}
      </p>
      <div className="admin-profile-grid">
        {visible.profile.profiles.map((p, i) => (
          <section className="panel" key={i}>
            <div className="panel-head">
              <h2>
                {p.source?.kind === 'idp'
                  ? `IdP · ${p.source.provider}`
                  : p.source
                    ? l('Identity 本地资料', 'Identity local profile')
                    : l('资料来源', 'Profile source')}
              </h2>
              <Tag>{statuses[p.status]}</Tag>
            </div>
            <Descriptions
              className="panel-body"
              column={1}
              size="small"
              items={[
                ...(['displayName', 'username', 'email', 'emailVerified'] as const).map((key) => ({
                  key,
                  label: fieldLabel(locale, key),
                  children:
                    p.fixed?.[key].status === 'available'
                      ? String(p.fixed[key].value)
                      : p.fixed
                        ? statuses[p.fixed[key].status]
                        : '—',
                })),
                {
                  key: 'snapshot',
                  label: l('观察快照', 'Snapshot'),
                  children: p.snapshotId ?? '—',
                },
                {
                  key: 'version',
                  label: l('来源配置版本', 'Source configuration version'),
                  children: p.providerConfigVersion ?? '—',
                },
                {
                  key: 'sourceRevision',
                  label: l('来源版本', 'Source revision'),
                  children: p.sourceRevision ?? '—',
                },
                {
                  key: 'observed',
                  label: l('观察时间', 'Observed at'),
                  children:
                    p.observedAt !== null ? new Date(p.observedAt * 1000).toLocaleString() : '—',
                },
                {
                  key: 'expiry',
                  label: l('到期', 'Expires'),
                  children:
                    p.expiresAt !== null ? new Date(p.expiresAt * 1000).toLocaleString() : '—',
                },
              ]}
            />
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>{l('用户字段', 'User fields')}</h2>
        </div>
        <DataTable
          locale={locale}
          rowKey="fieldId"
          dataSource={visible.profile.fields.filter((f) => f.displayUse !== 'hidden')}
          columns={[
            { title: l('字段', 'Field'), dataIndex: 'displayName' },
            {
              title: l('状态', 'Status'),
              dataIndex: 'status',
              render: (s: keyof typeof statuses) => <Tag>{statuses[s]}</Tag>,
            },
            {
              title: l('值', 'Value'),
              render: (_, f) =>
                f.status === 'available' ? (
                  <span className="profile-value">
                    {typeof f.value === 'string' ? f.value : JSON.stringify(f.value)}
                  </span>
                ) : (
                  '—'
                ),
            },
            {
              title: l('必需', 'Required'),
              dataIndex: 'required',
              render: (v: boolean) => (v ? l('是', 'Yes') : l('否', 'No')),
            },
          ]}
        />
      </section>
    </>
  )
}
function Profiles({ runtime, locale }: Props) {
  const l = labels(locale),
    { profiles, binding } = useAdministration(runtime)
  const [principal, setPrincipal] = useState<string | null>(null),
    [view, setView] = useState<Profile['view']>('current'),
    [preview, setPreview] = useState(false)
  const read = useRead(`${binding}/profile/${principal ?? 'self'}/${view}/${preview}`, () =>
    principal ? profiles.other(principal, preview) : profiles.self(view, preview),
  )
  return (
    <>
      <Form
        className="admin-toolbar"
        layout="inline"
        onFinish={(v: { principal?: string }) => {
          setPrincipal(v.principal || null)
          if ((v.principal || null) === principal) read.reload()
        }}
      >
        <Form.Item
          name="principal"
          label={l('他人主体标识（留空查看本人）', 'Other principal ID (empty for self)')}
          rules={[{ pattern: /^(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})?$/ }]}
        >
          <Input allowClear placeholder="UUID" />
        </Form.Item>
        <Button htmlType="submit">{l('读取资料', 'Read profile')}</Button>
        <Form.Item label={l('观察视图', 'Observation view')}>
          <Select
            aria-label={l('观察视图', 'Observation view')}
            value={principal ? 'latest' : view}
            disabled={principal !== null}
            className="admin-select"
            options={[
              { value: 'current', label: l('当前登录', 'Current login') },
              { value: 'latest', label: l('最新展示', 'Latest display') },
            ]}
            onChange={setView}
          />
        </Form.Item>
        <Form.Item label={l('预览脱敏（需要权限）', 'Redacted preview (requires permission)')}>
          <Switch
            aria-label={l('预览脱敏（需要权限）', 'Redacted preview (requires permission)')}
            checked={preview}
            onChange={setPreview}
          />
        </Form.Item>
      </Form>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {read.value && (
        <Projection
          key={`${binding}/${principal}/${view}/${preview}`}
          profile={read.value}
          locale={locale}
        />
      )}
    </>
  )
}
export function UserProfiles(props: Props) {
  const l = labels(props.locale)
  return (
    <>
      <Heading
        title={l('用户资料', 'User profiles')}
        hint={l(
          '字段映射、登录观察与完整性；由服务端决定可见范围',
          'Field mappings, login observations and completeness; visibility is server-controlled',
        )}
      />
      <Tabs
        destroyOnHidden
        items={[
          {
            key: 'profiles',
            label: l('资料投影', 'Profile projection'),
            children: <Profiles {...props} />,
          },
          {
            key: 'definitions',
            label: l('字段与来源映射', 'Field definitions and mappings'),
            children: <Definitions {...props} />,
          },
        ]}
      />
    </>
  )
}
