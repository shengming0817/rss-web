import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Select, Space, Tag } from 'antd'
import { identifier, operation, uuid } from '@rss/mdm-inventory'
import type { Resource } from '@rss/mdm-resources'
import {
  validatePublish,
  type Publication,
  type PublicationChange,
  type PublicationRow,
  type PublicationTarget,
  type PublicationTargetRow,
  type PublishInput,
} from '@rss/mdm-software/publications'
import { TextField } from './AuthorFields'
import { CollectionPlan } from './CollectionMappingEditor'
import {
  CursorControls,
  DirectoryControls,
  directoryQuery,
  Failure,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
import { DataTable } from './DataTable'
import { SecretTabs } from './SecretTabs'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { SoftwareMutationState, useSoftwareMutation, type PublicationsUseCases } from './SoftwareUi'
import type { ResourcesUseCases } from './ResourceCommand'
import type { Locale } from './i18n'

const publicationFields = [
  'id',
  'revision',
  'target',
  'resource',
  'version',
  'publication',
  'contentDigest',
  'manifestDigest',
  'targetDigest',
  'attempt',
  'outcome',
  'withdrawn',
  'withdrawal',
] as const satisfies readonly (keyof PublicationRow)[]
const targetFields = [
  'id',
  'digest',
  'protocol',
] as const satisfies readonly (keyof PublicationTargetRow)[]
function PublicationFacts({ value, locale }: { value: Publication; locale: Locale }) {
  const l = labels(locale),
    outcomes = {
      pending: l('处理中', 'Pending'),
      unknown: l('结果待确认', 'Unknown'),
      not_applied: l('未生效', 'Not applied'),
      published: l('已发布', 'Published'),
    },
    withdrawal =
      value.withdrawal === null
        ? l('尚无结果', 'No result')
        : {
            withdrawn: l('已撤回', 'Withdrawn'),
            not_published: l('未发布', 'Not published'),
            waiting_publication: l('等待原发布结算', 'Waiting for publication'),
            preflight_retryable: l('预检可重试', 'Preflight retryable'),
            unknown: l('撤回结果待确认', 'Withdrawal unknown'),
          }[value.withdrawal]
  return (
    <>
      <dl className="device-facts">
        <div>
          <dt>{l('发布记录', 'Publication record')}</dt>
          <dd>
            <code>{value.id}</code>
          </dd>
        </div>
        <div>
          <dt>{l('记录版本', 'Record revision')}</dt>
          <dd>{value.revision}</dd>
        </div>
        <div>
          <dt>{l('发布目标', 'Publication target')}</dt>
          <dd>{value.target}</dd>
        </div>
        <div>
          <dt>{l('精确资源版本', 'Exact resource version')}</dt>
          <dd>
            {value.resource} / {value.version}
          </dd>
        </div>
        <div>
          <dt>{l('原发布结果', 'Original publication outcome')}</dt>
          <dd>
            <Tag>{outcomes[value.outcome]}</Tag>
          </dd>
        </div>
        <div>
          <dt>{l('尝试代次', 'Attempt')}</dt>
          <dd>{value.attempt}</dd>
        </div>
        <div>
          <dt>{l('已请求撤回', 'Withdrawal requested')}</dt>
          <dd>{value.withdrawn ? l('是', 'Yes') : l('否', 'No')}</dd>
        </div>
        <div>
          <dt>{l('撤回结果', 'Withdrawal outcome')}</dt>
          <dd>{withdrawal}</dd>
        </div>
      </dl>
      <details>
        <summary>
          {l('发布、内容、清单与目标摘要', 'Publication, content, manifest and target digests')}
        </summary>
        <CollectionPlan
          value={{
            publication: value.publication,
            contentDigest: value.contentDigest,
            manifestDigest: value.manifestDigest,
            targetDigest: value.targetDigest,
          }}
        />
      </details>
      {value.document && (
        <details>
          <summary>
            {l('完整原生导出文档（只读）', 'Complete native export document (read only)')}
          </summary>
          <CollectionPlan value={value.document} />
        </details>
      )}
    </>
  )
}
function PublicationActions({
  publications,
  value,
  locale,
  canRecover,
  canWithdraw,
  blocked,
  done,
}: {
  publications: PublicationsUseCases
  value: Publication
  locale: Locale
  canRecover: boolean
  canWithdraw: boolean
  blocked: boolean
  done: () => void
}) {
  const l = labels(locale),
    mutation = useSoftwareMutation<{ id: string }, PublicationChange, Publication>(
      (original) => publications.change(original.target.id, original.change),
      (original) => {
        identifier(original.target.id)
        operation(original.change)
      },
    ),
    current = mutation.result ?? value,
    unresolved =
      ['pending', 'unknown'].includes(current.outcome) ||
      ['waiting_publication', 'preflight_retryable', 'unknown'].includes(current.withdrawal ?? '')
  return (
    <Card title={l('发布结果、撤回与恢复', 'Publication outcome, withdrawal and recovery')}>
      <PublicationFacts value={current} locale={locale} />
      <Alert
        type="info"
        title={l(
          '核实原未决结果不会重新上架软件。仅在原尝试确认未生效后显式重试；已请求撤回不代表远端删除已完成。',
          'Recovery checks an original undecided outcome and does not republish software. Retry only after an attempt is confirmed not applied. Requested withdrawal does not confirm remote removal.',
        )}
      />
      <Space wrap>
        <Button
          disabled={!canRecover || blocked || mutation.pending !== null || !unresolved}
          onClick={() =>
            void mutation.submit({ id: value.id }, value.revision, { action: 'recover' })
          }
        >
          {l('核实原发布或撤回结果', 'Recover original publication or withdrawal outcome')}
        </Button>
        <Button
          disabled={
            !canRecover ||
            blocked ||
            mutation.pending !== null ||
            current.outcome !== 'not_applied' ||
            current.withdrawn
          }
          onClick={() =>
            void mutation.submit({ id: value.id }, value.revision, { action: 'retry' })
          }
        >
          {l('重试已确认未生效的发布', 'Retry confirmed not-applied publication')}
        </Button>
        <Button
          danger
          disabled={!canWithdraw || blocked || mutation.pending !== null || current.withdrawn}
          onClick={() =>
            void mutation.submit({ id: value.id }, value.revision, { action: 'withdraw' })
          }
        >
          {l('请求撤回此源发布', 'Request withdrawal of source publication')}
        </Button>
      </Space>
      <SoftwareMutationState
        mutation={mutation}
        locale={locale}
        canReplay={mutation.pending?.change.input.action === 'withdraw' ? canWithdraw : canRecover}
        confirmedText={l(
          '原发布变更响应已确认，远端效果请以记录中的独立结果为准。',
          'Original publication mutation acknowledged. Read the independent recorded outcomes for remote effects.',
        )}
        lookup={(original) => publications.original(original.change.operationId)}
        lookupLabel={l(
          '查询此原操作关联发布记录',
          'Read publications associated with this original operation',
        )}
        done={done}
        blocked={blocked}
      />
    </Card>
  )
}
function TargetDirectory({
  publications,
  locale,
  disabled,
  select,
}: {
  publications: PublicationsUseCases
  locale: Locale
  disabled: boolean
  select: (id: string) => void
}) {
  const l = labels(locale),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(`publication-targets/${JSON.stringify(query)}`, () =>
      publications.targets(directoryQuery(query, targetFields)),
    )
  return (
    <Card
      size="small"
      title={l('宿主已配置的发布目标', 'Publication targets configured by the host')}
    >
      <DirectoryControls
        locale={locale}
        disabled={disabled}
        query={query}
        onChange={setQuery}
        fields={targetFields}
        sort={['id', 'protocol']}
        maximum={100}
      />
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        empty={read.value?.items.length === 0}
      />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="id"
            dataSource={read.value.items}
            columns={[
              {
                title: l('目标', 'Target'),
                render: (_, row) => (
                  <Button type="link" disabled={disabled} onClick={() => select(row.id)}>
                    {row.id}
                  </Button>
                ),
              },
              { title: l('协议', 'Protocol'), dataIndex: 'protocol' },
            ]}
          />
          <fieldset className="permission-panel" disabled={disabled}>
            <CursorControls
              locale={locale}
              next={read.value.nextCursor}
              count={read.value.items.length}
              query={query}
              onChange={setQuery}
            />
          </fieldset>
        </>
      )}
      <p className="subtitle">
        {l(
          '目标由宿主配置。Direct 软件材料不要求发布目标。',
          'The host configures targets. Direct software materials do not require a publication target.',
        )}
      </p>
    </Card>
  )
}
function PublicationCreate({
  publications,
  resources,
  locale,
  canPublish,
  canReadResource,
}: {
  publications: PublicationsUseCases
  resources: ResourcesUseCases
  locale: Locale
  canPublish: boolean
  canReadResource: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    [resourceId, setResourceId] = useState(''),
    [resource, setResource] = useState<Resource | null>(null),
    [version, setVersion] = useState(''),
    [targetId, setTargetId] = useState(''),
    [target, setTarget] = useState<PublicationTarget | null>(null),
    [targetRead, setTargetRead] = useState(false),
    mutation = useSoftwareMutation<Record<string, never>, PublishInput, Publication>(
      (original) => publications.publish(original.change),
      (original) => validatePublish(original.change),
    ),
    fixed = resource?.versions.find((value) => value.id === version),
    locked = action.busy || mutation.action.busy || mutation.pending !== null
  usePendingSelection(action.busy)
  async function readTarget(id: string) {
    setTargetId(id)
    setTarget(null)
    setTargetRead(false)
    const response = await action.run(() => publications.target(id))
    if (response.ok) {
      setTargetId(id)
      setTarget(response.value)
      setTargetRead(true)
    }
  }
  return (
    <>
      <TargetDirectory
        publications={publications}
        locale={locale}
        disabled={locked}
        select={(id) => void readTarget(id)}
      />
      <Card
        title={l('发布精确软件资源到原生源', 'Publish exact software Resource to a native source')}
      >
        <Form
          layout="vertical"
          disabled={locked}
          onFinish={() => {
            if (resource && fixed && target)
              void mutation.submit({}, 0, {
                action: 'publish',
                resource: resource.id,
                version: fixed.id,
                expectedResourceRevision: resource.revision,
                resourceDigest: fixed.digest,
                target: target.id,
                targetDigest: target.digest,
              })
          }}
        >
          <TextField
            label={l('发布软件资源标识', 'Software Resource ID to publish')}
            value={resourceId}
            onChange={(id) => {
              setResourceId(id)
              setResource(null)
              setVersion('')
            }}
          />
          <Button
            disabled={locked || !canReadResource || !resourceId}
            onClick={() =>
              void action
                .run(async () => {
                  const value = await resources.read(resourceId)
                  if (value.kind !== 'software') throw { cause: 'client', code: 'invalid_input' }
                  return value
                })
                .then((response) => {
                  if (response.ok) setResource(response.value)
                })
            }
          >
            {l('读取发布资源当前版本', 'Read current Resource revision for publication')}
          </Button>
          {resource && (
            <>
              <p className="subtitle">
                {l('Resource 存储版本', 'Resource storage revision')} {resource.revision}
              </p>
              <Form.Item label={l('发布的精确资源版本', 'Exact Resource version to publish')}>
                <Select
                  aria-label={l('发布的精确资源版本', 'Exact Resource version to publish')}
                  value={version || null}
                  options={resource.versions.map((version) => ({
                    value: version.id,
                    label: `${version.id} · ${version.state}`,
                  }))}
                  onChange={setVersion}
                />
              </Form.Item>
            </>
          )}
          <TextField
            label={l('发布目标标识', 'Publication target ID')}
            value={targetId}
            onChange={(id) => {
              setTargetId(id)
              setTarget(null)
              setTargetRead(false)
            }}
          />
          <Button disabled={locked || !targetId} onClick={() => void readTarget(targetId)}>
            {l('读取精确目标当前摘要', 'Read current exact target digest')}
          </Button>
          {targetRead && target === null && (
            <Alert
              type="info"
              title={l(
                '未找到此发布目标。目标由宿主配置。',
                'No matching publication target. The host configures targets.',
              )}
            />
          )}
          {target && (
            <>
              <p>
                <Tag>{target.protocol}</Tag> {target.id}
              </p>
              <code>
                {target.digest.map((value) => value.toString(16).padStart(2, '0')).join('')}
              </code>
            </>
          )}
          <Button
            type="primary"
            htmlType="submit"
            disabled={!canPublish || locked || !fixed || !target}
          >
            {l('提交此精确源发布', 'Submit exact source publication')}
          </Button>
        </Form>
        <Failure locale={locale} error={action.error} kind="read" />
        <SoftwareMutationState
          mutation={mutation}
          locale={locale}
          canReplay={canPublish}
          confirmedText={l(
            '发布请求响应已确认；远端发布效果仍以独立结果为准。',
            'Publication request acknowledged; remote publication has its own independent outcome.',
          )}
          lookup={(original) => publications.original(original.change.operationId)}
          lookupLabel={l(
            '查询原发布操作关联记录',
            'Read records for original publication operation',
          )}
        />
        {mutation.result && <PublicationFacts value={mutation.result} locale={locale} />}
      </Card>
    </>
  )
}
function PublicationDirectory({
  publications,
  locale,
  canRecover,
  canWithdraw,
}: {
  publications: PublicationsUseCases
  locale: Locale
  canRecover: boolean
  canWithdraw: boolean
}) {
  const l = labels(locale),
    guard = useSelectionGuard(),
    action = useAction(),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [selected, setSelected] = useState<Publication | null>(null),
    [id, setId] = useState(''),
    read = useRead(`publication-records/${JSON.stringify(query)}`, () =>
      publications.list(directoryQuery(query, publicationFields)),
    )
  usePendingSelection(action.busy || guard.locked)
  async function open(id: string) {
    const response = await action.run(() => publications.read(id))
    if (response.ok) setSelected(response.value)
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('原生源发布记录', 'Native-source publication records')}>
        <DirectoryControls
          locale={locale}
          disabled={action.busy || guard.locked}
          query={query}
          onChange={setQuery}
          fields={publicationFields}
          sort={['id', 'target', 'resource', 'version']}
          maximum={100}
        />
        <Button disabled={action.busy || guard.locked} onClick={read.reload}>
          {l('读取发布记录目录', 'Read publication record directory')}
        </Button>
        <ReadState
          locale={locale}
          busy={read.busy}
          error={read.error}
          empty={read.value?.items.length === 0}
        />
        {read.value && (
          <>
            <DataTable
              locale={locale}
              rowKey="id"
              dataSource={read.value.items}
              columns={[
                {
                  title: l('记录', 'Record'),
                  render: (_, row) => (
                    <Button
                      type="link"
                      disabled={guard.locked || action.busy}
                      onClick={() => void open(row.id)}
                    >
                      {row.id}
                    </Button>
                  ),
                },
                { title: l('目标', 'Target'), dataIndex: 'target' },
                { title: l('资源', 'Resource'), dataIndex: 'resource' },
                { title: l('版本', 'Version'), dataIndex: 'version' },
                { title: l('原发布结果', 'Original publication outcome'), dataIndex: 'outcome' },
                { title: l('撤回结果', 'Withdrawal outcome'), dataIndex: 'withdrawal' },
              ]}
            />
            <fieldset className="permission-panel" disabled={action.busy || guard.locked}>
              <CursorControls
                locale={locale}
                next={read.value.nextCursor}
                count={read.value.items.length}
                query={query}
                onChange={setQuery}
              />
            </fieldset>
          </>
        )}
        <Form layout="inline" disabled={guard.locked || action.busy} onFinish={() => void open(id)}>
          <Form.Item label={l('精确发布记录标识', 'Exact publication record ID')}>
            <Input
              aria-label={l('精确发布记录标识', 'Exact publication record ID')}
              value={id}
              onChange={(event) => setId(event.target.value)}
            />
          </Form.Item>
          <Button htmlType="submit" disabled={!id || guard.locked || action.busy}>
            {l('读取精确发布记录', 'Read exact publication record')}
          </Button>
        </Form>
        <Failure locale={locale} error={action.error} kind="read" />
      </Card>
      {selected && (
        <PublicationActions
          key={`${selected.id}/${selected.revision}`}
          publications={publications}
          value={selected}
          locale={locale}
          canRecover={canRecover}
          canWithdraw={canWithdraw}
          blocked={guard.locked}
          done={() => void open(selected.id)}
        />
      )}
    </SelectionGuard.Provider>
  )
}
function OriginalResults({
  publications,
  operation,
  locale,
}: {
  publications: PublicationsUseCases
  operation: string
  locale: Locale
}) {
  const [query, setQuery] = useState<{ limit: number; cursor?: string }>({ limit: 20 }),
    read = useRead(`original-publication/${operation}/${JSON.stringify(query)}`, () =>
      publications.original(operation, query),
    )
  return (
    <>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        empty={read.value?.items.length === 0}
      />
      {read.value && (
        <>
          <CollectionPlan value={read.value.items} />
          <CursorControls
            locale={locale}
            next={read.value.nextCursor}
            count={read.value.items.length}
            query={query}
            onChange={setQuery}
          />
        </>
      )}
    </>
  )
}
function OriginalLookup({
  publications,
  locale,
}: {
  publications: PublicationsUseCases
  locale: Locale
}) {
  const l = labels(locale),
    action = useAction(),
    [operation, setOperation] = useState(''),
    [selected, setSelected] = useState('')
  return (
    <Card title={l('按原操作读取发布关联记录', 'Read publication records by original operation')}>
      <Form
        layout="inline"
        onFinish={() =>
          void action
            .run(async () => uuid(operation))
            .then((response) => {
              if (response.ok) setSelected(response.value)
            })
        }
      >
        <Form.Item
          label={l('原发布或变更操作标识', 'Original publication or mutation operation ID')}
        >
          <Input
            aria-label={l('原发布或变更操作标识', 'Original publication or mutation operation ID')}
            value={operation}
            onChange={(event) => setOperation(event.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit" disabled={!operation || action.busy}>
          {l('查询原操作关联记录', 'Read original operation records')}
        </Button>
      </Form>
      <Failure locale={locale} error={action.error} kind="read" />
      <p className="subtitle">
        {l(
          '关联记录用于观察，不替代未知提交的原请求回执。',
          'Associated records provide an observation and do not replace an unknown submission’s original acknowledgement.',
        )}
      </p>
      {selected && (
        <OriginalResults
          key={selected}
          publications={publications}
          operation={selected}
          locale={locale}
        />
      )}
    </Card>
  )
}
export function SoftwarePublications({
  publications,
  resources,
  locale,
  canRead,
  canPublish,
  canRecover,
  canWithdraw,
  canReadResource,
}: {
  publications: PublicationsUseCases
  resources: ResourcesUseCases
  locale: Locale
  canRead: boolean
  canPublish: boolean
  canRecover: boolean
  canWithdraw: boolean
  canReadResource: boolean
}) {
  const l = labels(locale)
  return (
    <SecretTabs
      uiLocale={locale}
      authorizedKeys={[
        ...(canRead ? ['records', 'original'] : []),
        ...(canRead && canPublish && canReadResource ? ['publish'] : []),
      ]}
      items={[
        {
          key: 'records',
          label: l('发布与撤回', 'Publication and withdrawal'),
          children: (
            <PublicationDirectory
              publications={publications}
              locale={locale}
              canRecover={canRecover}
              canWithdraw={canWithdraw}
            />
          ),
        },
        {
          key: 'publish',
          label: l('新建源发布', 'New source publication'),
          children: (
            <PublicationCreate
              publications={publications}
              resources={resources}
              locale={locale}
              canPublish={canPublish}
              canReadResource={canReadResource}
            />
          ),
        },
        {
          key: 'original',
          label: l('原操作关联记录', 'Original operation records'),
          children: <OriginalLookup publications={publications} locale={locale} />,
        },
      ]}
    />
  )
}
