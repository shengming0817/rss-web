import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Space } from 'antd'
import { operation } from '@rss/mdm-inventory'
import { resourceId } from '@rss/mdm-resources'
import {
  validateSource,
  type SourceChange,
  type SourceDefinition,
  type SourceProtocol,
  type SourceRow,
  type SourceView,
} from '@rss/mdm-software'
import { Choice, TextField } from './AuthorFields'
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
import {
  LifecycleFacts,
  SoftwareMutationState,
  useSoftwareMutation,
  type SoftwareUseCases,
} from './SoftwareUi'
import type { Locale } from './i18n'

function SourceDefinitionAuthor({
  value,
  onChange,
  locale,
}: {
  value: SourceDefinition
  onChange: (value: SourceDefinition) => void
  locale: Locale
}) {
  const l = labels(locale),
    protocol = value.protocol
  return (
    <>
      <div className="admin-form-grid">
        <TextField
          label={l('来源标识', 'Source ID')}
          value={value.id}
          onChange={(id) => onChange({ ...value, id })}
        />
        <TextField
          label={l('来源精确版本', 'Exact source revision')}
          value={value.revision}
          onChange={(revision) => onChange({ ...value, revision })}
        />
      </div>
      <Choice
        label={l('来源协议', 'Source protocol')}
        value={protocol.kind}
        options={['private', 'winget_rest', 'winget_community', 'brew_tap']}
        onChange={(kind) => {
          const protocol: SourceProtocol =
            kind === 'private'
              ? { kind }
              : kind === 'winget_rest'
                ? { kind, location: '', identifier: '' }
                : kind === 'winget_community'
                  ? { kind, repository: '', commit: '' }
                  : { kind, repository: '', tap: '', commit: '' }
          onChange({ ...value, protocol })
        }}
      />
      {protocol.kind === 'winget_rest' && (
        <>
          <TextField
            label={l('WinGet HTTPS 地址', 'WinGet HTTPS location')}
            value={protocol.location}
            onChange={(location) => onChange({ ...value, protocol: { ...protocol, location } })}
          />
          <TextField
            label={l('WinGet 源标识', 'WinGet source identifier')}
            value={protocol.identifier}
            onChange={(identifier) => onChange({ ...value, protocol: { ...protocol, identifier } })}
          />
        </>
      )}
      {(protocol.kind === 'winget_community' || protocol.kind === 'brew_tap') && (
        <>
          <TextField
            label={l('来源仓库 HTTPS 地址', 'Source repository HTTPS location')}
            value={protocol.repository}
            onChange={(repository) => onChange({ ...value, protocol: { ...protocol, repository } })}
          />
          <TextField
            label={l(
              '固定提交（40 位小写十六进制）',
              'Fixed commit (40 lowercase hexadecimal characters)',
            )}
            value={protocol.commit}
            onChange={(commit) => onChange({ ...value, protocol: { ...protocol, commit } })}
          />
        </>
      )}
      {protocol.kind === 'brew_tap' && (
        <TextField
          label={l('Brew tap（owner/name）', 'Brew tap (owner/name)')}
          value={protocol.tap}
          onChange={(tap) => onChange({ ...value, protocol: { ...protocol, tap } })}
        />
      )}
    </>
  )
}
function SourceRegistration({
  software,
  locale,
  canWrite,
}: {
  software: SoftwareUseCases
  locale: Locale
  canWrite: boolean
}) {
  const l = labels(locale),
    [definition, setDefinition] = useState<SourceDefinition>({
      id: '',
      revision: '',
      protocol: { kind: 'private' },
    }),
    mutation = useSoftwareMutation<{ id: string; revision: string }, SourceChange, SourceView>(
      (original) =>
        software.changeSource(original.target.id, original.target.revision, original.change),
      (original) => {
        operation(original.change)
        resourceId(original.target.id)
        resourceId(original.target.revision)
        if (original.change.input.action === 'register')
          validateSource(original.change.input.definition)
      },
    )
  return (
    <Card title={l('注册新的来源版本', 'Register a new source revision')}>
      <Alert
        type="info"
        title={l(
          '来源定义不可原地修改。注册新版本；网络出站与凭据由宿主配置，地址不能包含凭据。',
          'Source definitions are immutable. Register a new revision; the host configures network egress and credentials. Locations must not contain credentials.',
        )}
      />
      <Form
        layout="vertical"
        disabled={!canWrite || mutation.action.busy || mutation.pending !== null}
        onFinish={() =>
          void mutation.submit({ id: definition.id, revision: definition.revision }, 0, {
            action: 'register',
            definition,
          })
        }
      >
        <SourceDefinitionAuthor value={definition} onChange={setDefinition} locale={locale} />
        <Button type="primary" htmlType="submit">
          {l('注册来源精确版本', 'Register exact source revision')}
        </Button>
      </Form>
      <SoftwareMutationState
        mutation={mutation}
        locale={locale}
        canReplay={canWrite}
        confirmedText={l('来源注册回执已确认。', 'Source registration acknowledged.')}
        lookup={(original) => software.source(original.target.id, original.target.revision)}
        lookupLabel={l('读取原来源当前状态', 'Read current state of original source')}
      />
      {mutation.result && (
        <>
          <CollectionPlan value={mutation.result.source} />
          <p className="subtitle">
            {l('服务端来源快照摘要', 'Server source snapshot digest')}{' '}
            <code>
              {mutation.result.snapshot.sha256
                .map((value) => value.toString(16).padStart(2, '0'))
                .join('')}
            </code>
          </p>
          <LifecycleFacts
            value={mutation.result.lifecycle}
            locale={locale}
            title={l('来源状态', 'Source state')}
          />
        </>
      )}
    </Card>
  )
}
function SourceLifecycle({
  software,
  source,
  locale,
  canEnable,
  canDisable,
  blocked,
  done,
}: {
  software: SoftwareUseCases
  source: SourceView
  locale: Locale
  canEnable: boolean
  canDisable: boolean
  blocked: boolean
  done: () => void
}) {
  const l = labels(locale),
    mutation = useSoftwareMutation<{ id: string; revision: string }, SourceChange, SourceView>(
      (original) =>
        software.changeSource(original.target.id, original.target.revision, original.change),
      (original) => {
        operation(original.change)
        resourceId(original.target.id)
        resourceId(original.target.revision)
      },
    )
  return (
    <Card title={`${source.source.id} / ${source.source.revision}`}>
      <CollectionPlan value={source.source} />
      <p className="subtitle">
        {l('来源快照摘要', 'Source snapshot digest')}{' '}
        <code>
          {source.snapshot.sha256.map((value) => value.toString(16).padStart(2, '0')).join('')}
        </code>
      </p>
      <LifecycleFacts
        value={mutation.result?.lifecycle ?? source.lifecycle}
        locale={locale}
        title={l('来源状态', 'Source state')}
      />
      <Space wrap>
        <Button
          disabled={!canEnable || blocked || mutation.pending !== null}
          onClick={() =>
            void mutation.submit(
              { id: source.source.id, revision: source.source.revision },
              source.lifecycle.revision,
              { action: 'enable' },
            )
          }
        >
          {l('启用此来源版本', 'Enable source revision')}
        </Button>
        <Button
          danger
          disabled={!canDisable || blocked || mutation.pending !== null}
          onClick={() =>
            void mutation.submit(
              { id: source.source.id, revision: source.source.revision },
              source.lifecycle.revision,
              { action: 'disable' },
            )
          }
        >
          {l('停用此来源版本', 'Disable source revision')}
        </Button>
      </Space>
      <SoftwareMutationState
        mutation={mutation}
        locale={locale}
        canReplay={mutation.pending?.change.input.action === 'disable' ? canDisable : canEnable}
        confirmedText={l('来源生命周期回执已确认。', 'Source lifecycle change acknowledged.')}
        lookup={(original) => software.source(original.target.id, original.target.revision)}
        lookupLabel={l('读取原来源当前状态', 'Read current state of original source')}
        done={done}
      />
    </Card>
  )
}
const sourceFields = [
  'id',
  'revision',
  'protocol',
  'state',
  'source',
  'snapshot',
  'lifecycle',
] as const satisfies readonly (keyof SourceRow)[]
function SourceDirectory({
  software,
  locale,
  canEnable,
  canDisable,
}: {
  software: SoftwareUseCases
  locale: Locale
  canEnable: boolean
  canDisable: boolean
}) {
  const l = labels(locale),
    guard = useSelectionGuard(),
    action = useAction(),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [selected, setSelected] = useState<SourceView | null>(null),
    [id, setId] = useState(''),
    [revision, setRevision] = useState(''),
    read = useRead(`software-sources/${JSON.stringify(query)}`, () =>
      software.sources(directoryQuery(query, sourceFields)),
    )
  usePendingSelection(guard.locked || action.busy)
  async function open(id: string, revision: string) {
    const response = await action.run(() => software.source(id, revision))
    if (response.ok) setSelected(response.value)
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('已注册的软件来源', 'Registered software sources')}>
        <DirectoryControls
          maximum={100}
          required={['id', 'revision']}
          disabled={guard.locked || action.busy}
          locale={locale}
          query={query}
          onChange={setQuery}
          fields={sourceFields}
          sort={['id', 'revision', 'protocol', 'state']}
        />
        <Button disabled={guard.locked || action.busy} onClick={read.reload}>
          {l('读取来源目录', 'Read source directory')}
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
              rowKey={(row) => JSON.stringify([row.id, row.revision])}
              dataSource={read.value.items}
              columns={[
                {
                  title: l('来源', 'Source'),
                  render: (_, row) => (
                    <Button
                      type="link"
                      disabled={guard.locked || action.busy}
                      onClick={() => void open(row.id, row.revision)}
                    >
                      {row.id}
                    </Button>
                  ),
                },
                { title: l('来源版本', 'Source revision'), dataIndex: 'revision' },
                { title: l('协议', 'Protocol'), dataIndex: 'protocol' },
                { title: l('来源状态', 'Source state'), dataIndex: 'state' },
              ]}
            />
            <fieldset className="permission-panel" disabled={guard.locked || action.busy}>
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
        <Form
          layout="inline"
          disabled={guard.locked || action.busy}
          onFinish={() => void open(id, revision)}
        >
          <Form.Item label={l('读取来源标识', 'Source ID to read')}>
            <Input
              aria-label={l('读取来源标识', 'Source ID to read')}
              value={id}
              onChange={(event) => setId(event.target.value)}
            />
          </Form.Item>
          <Form.Item label={l('读取来源版本', 'Source revision to read')}>
            <Input
              aria-label={l('读取来源版本', 'Source revision to read')}
              value={revision}
              onChange={(event) => setRevision(event.target.value)}
            />
          </Form.Item>
          <Button htmlType="submit" disabled={guard.locked || action.busy || !id || !revision}>
            {l('读取精确来源', 'Read exact source')}
          </Button>
        </Form>
        <Failure locale={locale} error={action.error} kind="read" />
      </Card>
      {selected && (
        <SourceLifecycle
          key={JSON.stringify([
            selected.source.id,
            selected.source.revision,
            selected.lifecycle.revision,
          ])}
          software={software}
          source={selected}
          locale={locale}
          canEnable={canEnable}
          canDisable={canDisable}
          blocked={guard.locked}
          done={() => void open(selected.source.id, selected.source.revision)}
        />
      )}
    </SelectionGuard.Provider>
  )
}
export function SoftwareSources({
  software,
  locale,
  canRead,
  canWrite,
  canWithdraw,
}: {
  software: SoftwareUseCases
  locale: Locale
  canRead: boolean
  canWrite: boolean
  canWithdraw: boolean
}) {
  const l = labels(locale)
  return (
    <SecretTabs
      uiLocale={locale}
      authorizedKeys={[...(canRead ? ['directory'] : []), ...(canWrite ? ['register'] : [])]}
      items={[
        {
          key: 'directory',
          label: l('已注册来源', 'Registered sources'),
          children: (
            <SourceDirectory
              software={software}
              locale={locale}
              canEnable={canWrite}
              canDisable={canWithdraw}
            />
          ),
        },
        {
          key: 'register',
          label: l('注册来源', 'Register source'),
          children: <SourceRegistration software={software} locale={locale} canWrite={canWrite} />,
        },
      ]}
    />
  )
}
