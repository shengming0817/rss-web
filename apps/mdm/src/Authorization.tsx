import { DataTable } from './DataTable'
import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
} from 'antd'
import {
  prepareChange,
  validateRule,
  validateGroup,
  type Change,
  type Rule,
  type UserGroup,
  type Revision,
  type RuleRow,
  type GroupRow,
  type Subject,
  type Source,
  type Realm,
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
  Heading,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
import { ApiAccess } from './ApiAccess'
type Props = { runtime: Runtime; locale: Locale }
export function SubjectEditor({
  value,
  onChange,
  runtime,
  locale,
  instance,
}: Props & {
  value?: Subject
  onChange?: (subject: Subject) => void
  instance: string
}) {
  const l = labels(locale),
    { authorization, binding } = useAdministration(runtime)
  const kind = value?.kind ?? 'user'
  const departments = useRead(`${binding}/department-choice/${kind}`, () =>
    kind === 'department' ? authorization.departments() : Promise.resolve(null),
  )
  const [, tick] = useState(0)
  useEffect(() => {
    if (departments.value?.status !== 'available') return
    const timer = setTimeout(
      () => tick((v) => v + 1),
      Math.max(0, departments.value.expiresAt * 1000 - Date.now()) + 1,
    )
    return () => clearTimeout(timer)
  }, [departments.value])
  const providers = useRead(`${binding}/subject-providers/${kind}`, () =>
    (kind === 'idp_group' || kind === 'department') && runtime.oidcEnabled
      ? runtime.administration().identity.providers()
      : Promise.resolve(null),
  )
  const snapshot =
    departments.value?.status === 'available' && departments.value.expiresAt * 1000 > Date.now()
      ? departments.value
      : null
  const source =
    value && 'source' in value
      ? value.source
      : { providerId: '', issuer: '', configurationVersion: 1 }
  const changeSource = (part: Partial<Source>) => {
    if (value?.kind === 'idp_group' || value?.kind === 'department')
      onChange?.({ ...value, source: { ...source, ...part } })
  }
  return (
    <Space direction="vertical" className="full-width">
      <Select
        aria-label={l('主体类型', 'Subject type')}
        value={kind}
        className="full-width"
        options={(runtime.management
          ? ['user']
          : ['user', 'user_group', 'idp_group', 'department']
        ).map((kind) => ({
          value: kind,
          label: {
            user: l('Identity 账户', 'Identity account'),
            user_group: l('本地授权用户组', 'Local authorization user group'),
            idp_group: l('IdP 组引用', 'IdP group reference'),
            department: l('来源部门', 'Source department'),
          }[kind],
        }))}
        onChange={(kind: Subject['kind']) =>
          onChange?.(
            kind === 'user'
              ? { kind, user: { instanceId: instance, tenantId: runtime.tenant, principalId: '' } }
              : kind === 'user_group'
                ? { kind, id: '' }
                : kind === 'idp_group'
                  ? { kind, source, id: '' }
                  : { kind, source: snapshot?.source ?? source, id: '', matching: 'exact' },
          )
        }
      />
      {kind === 'user' && (
        <Input
          aria-label={l('账户主体标识', 'Account principal ID')}
          value={value?.kind === 'user' ? value.user.principalId : ''}
          placeholder={l('Identity principal UUID', 'Identity principal UUID')}
          onChange={(e) =>
            onChange?.({
              kind: 'user',
              user: {
                instanceId: instance,
                tenantId: runtime.tenant,
                principalId: e.target.value,
              },
            })
          }
        />
      )}
      {kind === 'user_group' && (
        <Input
          aria-label={l('授权用户组标识', 'Authorization user group ID')}
          value={value?.kind === 'user_group' ? value.id : ''}
          placeholder="UUID"
          onChange={(e) => onChange?.({ kind: 'user_group', id: e.target.value })}
        />
      )}
      {(kind === 'idp_group' || kind === 'department') && (
        <>
          <Alert
            type="info"
            title={l(
              '来源坐标必须与已生效 Provider 配置一致；此引用不代表目录成员或授权证明。',
              'Source coordinates must match the active Provider configuration. A reference is not membership or authorization proof.',
            )}
          />
          <Select
            aria-label={l('选择已配置身份来源', 'Choose configured identity source')}
            allowClear
            options={
              providers.value?.map((p) => ({
                value: p.id,
                label: `${p.settings.issuer} · v${p.version}`,
              })) ?? []
            }
            onChange={(id: string | undefined) => {
              const p = providers.value?.find((p) => p.id === id)
              if (p)
                changeSource({
                  providerId: p.id,
                  issuer: p.settings.issuer,
                  configurationVersion: p.version,
                })
            }}
            placeholder={l(
              '可读取 Provider 配置时选择；也可输入精确来源坐标',
              'Select readable Provider settings, or enter exact source coordinates',
            )}
          />
          <Input
            aria-label={l('Provider 标识', 'Provider ID')}
            value={source.providerId}
            placeholder="Provider UUID"
            onChange={(e) => changeSource({ providerId: e.target.value })}
          />
          <Input
            aria-label="Issuer"
            value={source.issuer}
            placeholder="https://…"
            onChange={(e) => changeSource({ issuer: e.target.value })}
          />
          <Input
            aria-label={l('来源配置版本', 'Source configuration version')}
            value={source.configurationVersion}
            inputMode="numeric"
            onChange={(e) => changeSource({ configurationVersion: Number(e.target.value) })}
          />
          {kind === 'idp_group' && (
            <Input
              aria-label={l('IdP 组标识', 'IdP group ID')}
              value={value && 'id' in value ? value.id : ''}
              onChange={(e) => onChange?.({ kind: 'idp_group', source, id: e.target.value })}
            />
          )}
          {kind === 'department' && (
            <>
              <ReadState busy={departments.busy} error={departments.error} locale={locale} />
              {!snapshot && !departments.busy && (
                <Alert
                  type="warning"
                  title={l(
                    '当前部门观察缺失、过期或不可用，不能从目录选择。现有引用可保留。',
                    'The department observation is missing, expired or unavailable. Existing references can be retained.',
                  )}
                />
              )}
              <Select
                showSearch
                optionFilterProp="label"
                className="full-width"
                aria-label={l('部门', 'Department')}
                disabled={!snapshot}
                value={value?.kind === 'department' ? value.id || null : null}
                options={
                  snapshot?.snapshot.nodes.map((n) => ({
                    value: n.id,
                    label: `${n.displayName} · ${n.id}`,
                  })) ?? []
                }
                onChange={(id: string) => {
                  if (snapshot)
                    onChange?.({
                      kind: 'department',
                      source: snapshot.source,
                      id,
                      matching: value?.kind === 'department' ? value.matching : 'exact',
                    })
                }}
              />
              <Select
                aria-label={l('部门匹配', 'Department matching')}
                value={value?.kind === 'department' ? value.matching : 'exact'}
                options={[
                  { value: 'exact', label: l('仅此部门', 'Exact department') },
                  { value: 'subtree', label: l('包含下级部门', 'Include descendants') },
                ]}
                onChange={(matching: 'exact' | 'subtree') => {
                  if (value?.kind === 'department') onChange?.({ ...value, matching })
                }}
              />
            </>
          )}
        </>
      )}
    </Space>
  )
}
function RuleEditor({
  detail,
  runtime,
  locale,
  instance,
  done,
}: Props & {
  detail: Revision<Rule>
  instance: string
  done: () => void
}) {
  const l = labels(locale),
    { authorization } = useAdministration(runtime),
    action = useAction()
  const [pending, setPending] = useState<Change<Rule> | null>(null),
    [invalid, setInvalid] = useState(false)
  const realm: Realm = runtime.management ? 'management' : 'tenant'
  async function submit(change: Change<Rule>) {
    const result = await action.run(() => authorization.changeRule(detail.id, change))
    if (result.ok) done()
  }
  return (
    <>
      <Descriptions
        size="small"
        column={1}
        items={[
          { key: 'id', label: 'ID', children: detail.id },
          { key: 'revision', label: l('版本', 'Revision'), children: detail.revision },
        ]}
      />
      <Failure error={action.error} locale={locale} />
      {invalid && (
        <Alert
          type="error"
          title={l(
            '请检查主体、来源、权限范围及重复权限。',
            'Check subject, source coordinates, permission scopes and duplicate permissions.',
          )}
          role="alert"
        />
      )}
      {detail.revision > 0 && !detail.value ? (
        <Alert
          type="warning"
          title={l(
            '规则已删除。墓碑不能编辑或复用，请创建新标识。',
            'This rule is deleted. Create a fresh ID instead of editing or reusing its tombstone.',
          )}
        />
      ) : (
        <Form
          layout="vertical"
          disabled={action.busy || pending !== null}
          initialValues={
            detail.value ?? {
              subject: {
                kind: 'user',
                user: { instanceId: instance, tenantId: runtime.tenant, principalId: '' },
              },
              grants: [],
            }
          }
          onFinish={(value: Rule) => {
            try {
              validateRule(value, runtime.tenant, realm)
              const operationId = crypto.randomUUID()
              const change = detail.revision
                ? prepareChange(operationId, detail, value)
                : { operationId, expectedRevision: 0, value: structuredClone(value) }
              setInvalid(false)
              setPending(change)
              void submit(change)
            } catch {
              setInvalid(true)
            }
          }}
        >
          <Form.Item name="subject" label={l('规则主体', 'Rule subject')} required>
            <SubjectEditor runtime={runtime} locale={locale} instance={instance} />
          </Form.Item>
          <Form.Item name="grants" label={l('授权权限', 'Permission grants')} required>
            <GrantEditor realm={realm} locale={locale} />
          </Form.Item>
          <Button type="primary" htmlType="submit" disabled={!instance} loading={action.busy}>
            {l('保存规则', 'Save rule')}
          </Button>
        </Form>
      )}
      {pending && (
        <div className="admin-recovery">
          <Alert
            type="info"
            title={l(
              '原请求已锁定。重提保持同一操作标识和内容；读取当前对象不能确认原操作。',
              'The original request is locked. Resubmission keeps its operation ID and body; a current object read cannot confirm it.',
            )}
          />
          <code>{pending.operationId}</code>
          <Button disabled={action.busy} onClick={() => void submit(pending)}>
            {l('显式重提原请求', 'Resubmit original request')}
          </Button>
        </div>
      )}
    </>
  )
}
function Rules({ runtime, locale, instance }: Props & { instance: string }) {
  const l = labels(locale),
    { authorization, binding } = useAdministration(runtime)
  const [query, setQuery] = useState<Query>({ limit: 20 }),
    [selected, setSelected] = useState<string | null>(null)
  const [create, setCreate] = useState<Revision<Rule> | null>(null),
    [deleting, setDeleting] = useState<Revision<Rule> | null>(null)
  const [deleteIntent, setDeleteIntent] = useState<Change<Rule> | null>(null),
    action = useAction()
  const fields: (keyof RuleRow)[] = ['id', 'revision', 'deleted', 'subjectKind', 'value']
  const page = useRead(`${binding}/rules/${JSON.stringify(query)}`, () =>
    authorization.rules(directoryQuery(query, fields)),
  )
  const detail = useRead(`${binding}/rule/${selected}`, () =>
    selected ? authorization.rule(selected) : Promise.resolve(null),
  )
  const done = () => {
    setSelected(null)
    setCreate(null)
    page.reload()
  }
  return (
    <>
      <div className="admin-section-actions">
        <Button
          type="primary"
          disabled={!instance}
          onClick={() => setCreate({ id: crypto.randomUUID(), revision: 0, value: null })}
        >
          {l('创建规则', 'Create rule')}
        </Button>
        <Button onClick={page.reload}>{l('重新读取', 'Read again')}</Button>
      </div>
      <DirectoryControls
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={fields}
        sort={['id', 'revision', 'deleted', 'subjectKind']}
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
                title: l('规则', 'Rule'),
                dataIndex: 'id',
                render: (id: string) => (
                  <Button type="link" onClick={() => setSelected(id)}>
                    {id}
                  </Button>
                ),
              },
              ...(['revision', 'subjectKind', 'deleted'] as const)
                .filter((field) => !query.fields || query.fields.includes(field))
                .map((field) => ({
                  title: fieldLabel(locale, field),
                  dataIndex: field,
                  render: (v: unknown) =>
                    typeof v === 'boolean' ? (
                      <Tag>{v ? l('已删除', 'Deleted') : l('有效', 'Active')}</Tag>
                    ) : (
                      cellText(locale, v)
                    ),
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
        open={selected !== null || create !== null}
        title={l('授权规则', 'Authorization rule')}
        width={760}
        footer={null}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        onCancel={() => {
          setSelected(null)
          setCreate(null)
        }}
      >
        {create ? (
          <RuleEditor
            key={create.id}
            detail={create}
            runtime={runtime}
            locale={locale}
            instance={instance}
            done={done}
          />
        ) : (
          <>
            <ReadState busy={detail.busy} error={detail.error} locale={locale} />
            {detail.value && (
              <>
                <RuleEditor
                  key={`${detail.value.id}/${detail.value.revision}`}
                  detail={detail.value}
                  runtime={runtime}
                  locale={locale}
                  instance={instance}
                  done={done}
                />
                {detail.value.value && (
                  <Button
                    danger
                    onClick={() => {
                      setDeleting(detail.value!)
                      setDeleteIntent(null)
                    }}
                  >
                    {l('删除规则', 'Delete rule')}
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={deleting !== null}
        title={l('删除授权规则？', 'Delete authorization rule?')}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        onCancel={() => {
          setDeleting(null)
          setDeleteIntent(null)
          action.clear()
        }}
        confirmLoading={action.busy}
        okButtonProps={{ danger: true }}
        okText={
          deleteIntent ? l('显式重提原请求', 'Resubmit original request') : l('删除', 'Delete')
        }
        onOk={() => {
          if (!deleting) return
          const change = deleteIntent ?? prepareChange(crypto.randomUUID(), deleting, null)
          setDeleteIntent(change)
          void action
            .run(() => authorization.changeRule(deleting.id, change))
            .then((result) => {
              if (result.ok) {
                setDeleting(null)
                setSelected(null)
                page.reload()
              }
            })
        }}
      >
        <Failure error={action.error} locale={locale} />
        <p>
          {l(
            '删除会保留永久墓碑。重新创建必须使用新标识。',
            'Deletion leaves a permanent tombstone. Recreating requires a fresh ID.',
          )}
        </p>
        {deleteIntent && <code>{deleteIntent.operationId}</code>}
      </Modal>
    </>
  )
}
function GroupEditor({
  runtime,
  locale,
  instance,
  detail,
  done,
}: Props & { instance: string; detail: Revision<UserGroup>; done: () => void }) {
  const l = labels(locale),
    { authorization } = useAdministration(runtime),
    action = useAction()
  const [pending, setPending] = useState<Change<UserGroup> | null>(null),
    [invalid, setInvalid] = useState(false)
  const [memberQuery, setMemberQuery] = useState<Query>({ limit: 20 })
  const memberFields = ['principalId', 'instanceId', 'tenantId'] as const
  const members = useRead(
    `${detail.id}/${detail.revision}/members/${JSON.stringify(memberQuery)}`,
    () =>
      detail.revision && detail.value
        ? authorization.members(detail.id, directoryQuery(memberQuery, memberFields))
        : Promise.resolve(null),
  )
  async function submit(change: Change<UserGroup>) {
    const result = await action.run(() => authorization.changeGroup(detail.id, change))
    if (result.ok) done()
  }
  return (
    <>
      <p className="subtitle">
        {detail.id} · revision {detail.revision}
      </p>
      <Failure error={action.error} locale={locale} />
      {invalid && (
        <Alert
          type="error"
          title={l(
            '请检查名称、账户标识和重复成员。',
            'Check the name, account IDs and duplicate members.',
          )}
          role="alert"
        />
      )}
      {detail.revision && !detail.value ? (
        <Alert
          type="warning"
          title={l(
            '此授权用户组已删除，不能复用。',
            'This authorization user group is deleted and cannot be reused.',
          )}
        />
      ) : (
        <Form
          layout="vertical"
          disabled={action.busy || pending !== null}
          initialValues={{
            name: detail.value?.name ?? '',
            enabled: detail.value?.enabled ?? true,
            principals: detail.value?.members.map((m) => m.principalId).join('\n') ?? '',
          }}
          onFinish={(value: { name: string; enabled: boolean; principals: string }) => {
            try {
              const group = {
                name: value.name,
                enabled: value.enabled,
                members: value.principals
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((principalId) => ({
                    instanceId: instance,
                    tenantId: runtime.tenant,
                    principalId,
                  })),
              }
              validateGroup(group, runtime.tenant)
              const operationId = crypto.randomUUID(),
                change = detail.revision
                  ? prepareChange(operationId, detail, group)
                  : { operationId, expectedRevision: 0, value: group }
              setPending(change)
              setInvalid(false)
              void submit(change)
            } catch {
              setInvalid(true)
            }
          }}
        >
          <Form.Item
            name="name"
            label={l('用户组名称', 'User group name')}
            rules={[{ required: true }]}
          >
            <Input maxLength={1024} />
          </Form.Item>
          <Form.Item name="enabled" label={l('启用', 'Enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="principals"
            label={l(
              'Identity 账户主体标识，每行一个',
              'Identity account principal IDs, one per line',
            )}
          >
            <Input.TextArea rows={6} />
          </Form.Item>
          <Alert
            type="info"
            title={l(
              '这是本地授权 User Group，不是设备组。保存完整成员集合使用当前详情版本。',
              'This is a local authorization User Group. Saving replaces the full membership using the detail revision.',
            )}
          />
          <Button type="primary" htmlType="submit" loading={action.busy} disabled={!instance}>
            {l('保存用户组', 'Save user group')}
          </Button>
        </Form>
      )}
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          <Button disabled={action.busy} onClick={() => void submit(pending)}>
            {l('显式重提原请求', 'Resubmit original request')}
          </Button>
        </div>
      )}
      {detail.value && detail.revision > 0 && (
        <section className="admin-subsection">
          <h3>{l('正式成员目录', 'Member directory')}</h3>
          <DirectoryControls
            locale={locale}
            query={memberQuery}
            onChange={setMemberQuery}
            fields={memberFields}
            required="principalId"
            sort={['principalId']}
          />
          <ReadState busy={members.busy} error={members.error} locale={locale} />
          {members.value && (
            <>
              <p className="subtitle">revision {members.value.revision}</p>
              <ul className="admin-id-list">
                {members.value.items.map((m) => (
                  <li key={m.principalId}>{m.principalId}</li>
                ))}
              </ul>
              <CursorControls
                locale={locale}
                query={memberQuery}
                onChange={setMemberQuery}
                next={members.value.nextCursor}
                count={members.value.items.length}
              />
            </>
          )}
        </section>
      )}
    </>
  )
}
function Groups({ runtime, locale, instance }: Props & { instance: string }) {
  const l = labels(locale),
    { authorization, binding } = useAdministration(runtime),
    action = useAction()
  const [query, setQuery] = useState<Query>({ limit: 20 }),
    [id, setId] = useState<string | null>(null),
    [fresh, setFresh] = useState<Revision<UserGroup> | null>(null)
  const [deleting, setDeleting] = useState<Revision<UserGroup> | null>(null),
    [pending, setPending] = useState<Change<UserGroup> | null>(null)
  const fields: (keyof GroupRow)[] = [
    'id',
    'revision',
    'deleted',
    'name',
    'enabled',
    'memberCount',
    'value',
  ]
  const page = useRead(`${binding}/groups/${JSON.stringify(query)}`, () =>
    authorization.groups(directoryQuery(query, fields)),
  )
  const detail = useRead(`${binding}/group/${id}`, () =>
    id ? authorization.group(id) : Promise.resolve(null),
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
          disabled={!instance}
          onClick={() => setFresh({ id: crypto.randomUUID(), revision: 0, value: null })}
        >
          {l('创建授权用户组', 'Create authorization user group')}
        </Button>
        <Button onClick={page.reload}>{l('重新读取', 'Read again')}</Button>
      </div>
      <DirectoryControls
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={fields}
        sort={['id', 'revision', 'deleted', 'name', 'enabled', 'memberCount']}
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
                title: l('授权用户组', 'Authorization user group'),
                dataIndex: 'id',
                render: (id: string, row) => (
                  <Button type="link" onClick={() => setId(id)}>
                    {row.name ?? id}
                  </Button>
                ),
              },
              ...(['revision', 'enabled', 'memberCount', 'deleted'] as const)
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
        title={l('授权用户组详情', 'Authorization user group detail')}
        width={760}
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
          <GroupEditor
            key={fresh.id}
            runtime={runtime}
            locale={locale}
            instance={instance}
            detail={fresh}
            done={done}
          />
        ) : (
          <>
            <ReadState busy={detail.busy} error={detail.error} locale={locale} />
            {detail.value && (
              <>
                <GroupEditor
                  key={`${detail.value.id}/${detail.value.revision}`}
                  runtime={runtime}
                  locale={locale}
                  instance={instance}
                  detail={detail.value}
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
                    {l('删除授权用户组', 'Delete authorization user group')}
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={deleting !== null}
        title={l('删除授权用户组？', 'Delete authorization user group?')}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        confirmLoading={action.busy}
        okButtonProps={{ danger: true }}
        okText={pending ? l('显式重提原请求', 'Resubmit original request') : l('删除', 'Delete')}
        onCancel={() => {
          setDeleting(null)
          setPending(null)
          action.clear()
        }}
        onOk={() => {
          if (!deleting) return
          const change = pending ?? prepareChange(crypto.randomUUID(), deleting, null)
          setPending(change)
          void action
            .run(() => authorization.changeGroup(deleting.id, change))
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
        <p>{l('删除会保留永久墓碑。', 'Deletion leaves a permanent tombstone.')}</p>
        {pending && <code>{pending.operationId}</code>}
      </Modal>
    </>
  )
}
function Effective({ runtime, locale }: Props) {
  const l = labels(locale),
    { authorization, binding } = useAdministration(runtime)
  const read = useRead(`${binding}/effective`, authorization.effective)
  return (
    <>
      <Button onClick={read.reload}>{l('重新读取有效权限', 'Read effective permissions')}</Button>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {read.value && (
        <>
          <Descriptions
            className="admin-detail-facts"
            column={1}
            items={[
              { key: 'instance', label: 'Instance', children: read.value.instanceId },
              { key: 'tenant', label: l('租户', 'Tenant'), children: read.value.tenantId },
              { key: 'principal', label: l('主体', 'Principal'), children: read.value.principalId },
            ]}
          />
          <DataTable
            locale={locale}
            rowKey={(_row, index) => String(index)}
            dataSource={[...read.value.grants]}
            columns={[
              { title: l('权限', 'Permission'), dataIndex: 'operation' },
              {
                title: l('范围', 'Scope'),
                render: (_, g) =>
                  g.scope.kind === 'device' ? `${g.scope.kind} / ${g.scope.id}` : g.scope.kind,
              },
              { title: l('来源规则', 'Source rule'), dataIndex: 'ruleId' },
              { title: l('规则版本', 'Rule revision'), dataIndex: 'ruleRevision' },
              {
                title: l('观察', 'Observation'),
                render: (_, g) =>
                  g.observation
                    ? new Date(g.observation.expiresAt * 1000).toLocaleString(
                        locale === 'zh' ? 'zh-CN' : 'en-US',
                      )
                    : '—',
              },
            ]}
          />
          <Alert
            type="info"
            title={l(
              '这是服务端返回的权限事实。前端不据此推算资源授权或组织成员关系。',
              'These are server-returned permission facts. The UI does not evaluate resource authorization or organizational membership.',
            )}
          />
        </>
      )}
    </>
  )
}
export function Authorization({ runtime, locale }: Props) {
  const l = labels(locale),
    { authorization, binding } = useAdministration(runtime)
  const effective = useRead(`${binding}/authoring-instance`, authorization.effective)
  const [tab, setTab] = useState('rules')
  return (
    <>
      <Heading
        title={l('授权管理', 'Authorization')}
        hint={
          runtime.management
            ? l('管理租户 · 本地账户规则', 'Management realm · local account rules')
            : l(
                '规则、授权用户组与程序访问',
                'Rules, authorization user groups and programmatic access',
              )
        }
      />
      <Failure error={effective.error} locale={locale} />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        destroyOnHidden
        items={[
          {
            key: 'rules',
            label: l('授权规则', 'Rules'),
            children: (
              <Rules
                key={binding}
                runtime={runtime}
                locale={locale}
                instance={effective.value?.instanceId ?? ''}
              />
            ),
          },
          {
            key: 'effective',
            label: l('有效权限', 'Effective permissions'),
            children: <Effective runtime={runtime} locale={locale} />,
          },
          ...(!runtime.management
            ? [
                {
                  key: 'groups',
                  label: l('授权用户组', 'User groups'),
                  children: (
                    <Groups
                      key={binding}
                      runtime={runtime}
                      locale={locale}
                      instance={effective.value?.instanceId ?? ''}
                    />
                  ),
                },
              ]
            : []),
          {
            key: 'access',
            label: runtime.management ? l('网络策略', 'Network policy') : l('API Key', 'API keys'),
            children: <ApiAccess runtime={runtime} locale={locale} />,
          },
        ]}
      />
    </>
  )
}
