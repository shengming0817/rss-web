import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Space } from 'antd'
import { operation } from '@rss/mdm-inventory'
import { resourceId } from '@rss/mdm-resources'
import type { VersionDetail, VersionReceipt, VersionRow } from '@rss/mdm-software'
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
import { CollectionPlan } from './CollectionMappingEditor'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import {
  LifecycleFacts,
  SoftwareMutationState,
  useSoftwareMutation,
  type SoftwareUseCases,
} from './SoftwareUi'
import type { Locale } from './i18n'

function AdmissionDetail({
  software,
  value,
  locale,
  canEnable,
  canWithdraw,
  blocked,
  reload,
}: {
  software: SoftwareUseCases
  value: VersionDetail
  locale: Locale
  canEnable: boolean
  canWithdraw: boolean
  blocked: boolean
  reload: () => void
}) {
  const l = labels(locale),
    mutation = useSoftwareMutation<
      { resource: string; version: string },
      { readonly action: 'enable' | 'withdraw' },
      VersionReceipt
    >(
      (original) =>
        software.changeVersion(original.target.resource, original.target.version, original.change),
      (original) => {
        operation(original.change)
        resourceId(original.target.resource)
        resourceId(original.target.version)
      },
    )
  return (
    <Card title={`${value.resource} / ${value.version}`}>
      <p className="subtitle">
        {l('Resource 存储版本', 'Resource storage revision')} {value.resourceRevision} ·{' '}
        {l('精确资源版本摘要', 'Exact resource version digest')}{' '}
        <code>
          {value.resourceDigest.map((value) => value.toString(16).padStart(2, '0')).join('')}
        </code>
      </p>
      <CollectionPlan value={value.presentation} />
      <LifecycleFacts
        value={mutation.result?.lifecycle ?? value.lifecycle}
        locale={locale}
        title={l('软件版本准入', 'Software version admission')}
      />
      <Alert
        type="info"
        title={l(
          '准入不代表 Resource 已激活、WinGet/Brew 已发布或设备已安装。Direct 材料无需先发布原生源。',
          'Admission does not confirm Resource activation, WinGet/Brew publication or device installation. Direct materials do not require native-source publication.',
        )}
      />
      <Space wrap>
        <Button
          type="primary"
          disabled={!canEnable || blocked || mutation.pending !== null}
          onClick={() =>
            void mutation.submit(
              { resource: value.resource, version: value.version },
              value.lifecycle?.revision ?? 0,
              { action: 'enable' },
            )
          }
        >
          {l('准入此软件版本', 'Admit software version')}
        </Button>
        <Button
          danger
          disabled={
            !canWithdraw ||
            blocked ||
            mutation.pending !== null ||
            value.lifecycle?.state !== 'enabled'
          }
          onClick={() =>
            void mutation.submit(
              { resource: value.resource, version: value.version },
              value.lifecycle!.revision,
              { action: 'withdraw' },
            )
          }
        >
          {l('撤回此软件版本准入', 'Withdraw software version admission')}
        </Button>
      </Space>
      <SoftwareMutationState
        mutation={mutation}
        locale={locale}
        canReplay={mutation.pending?.change.input.action === 'withdraw' ? canWithdraw : canEnable}
        confirmedText={l('软件准入变更回执已确认。', 'Software admission change acknowledged.')}
        lookup={(original) => software.version(original.target.resource, original.target.version)}
        lookupLabel={l('读取原软件版本准入事实', 'Read original software version admission')}
        done={reload}
        blocked={blocked}
      />
    </Card>
  )
}
const fields = ['resource', 'version', 'state'] as const satisfies readonly (keyof VersionRow)[]
function ResourceVersions({
  software,
  resource,
  locale,
  canEnable,
  canWithdraw,
}: {
  software: SoftwareUseCases
  resource: string
  locale: Locale
  canEnable: boolean
  canWithdraw: boolean
}) {
  const l = labels(locale),
    guard = useSelectionGuard(),
    action = useAction(),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [selected, setSelected] = useState<VersionDetail | null>(null),
    [version, setVersion] = useState(''),
    read = useRead(`software-versions/${resource}/${JSON.stringify(query)}`, () =>
      software.versions(resource, directoryQuery(query, fields)),
    )
  usePendingSelection(action.busy || guard.locked)
  async function open(version: string) {
    const response = await action.run(() => software.version(resource, version))
    if (response.ok) setSelected(response.value)
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={`${l('精确资源的版本', 'Versions of exact resource')}: ${resource}`}>
        <DirectoryControls
          locale={locale}
          disabled={action.busy || guard.locked}
          query={query}
          onChange={setQuery}
          fields={fields}
          sort={['version', 'state']}
          required="version"
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
              rowKey={(row) => row.version}
              dataSource={read.value.items}
              columns={[
                {
                  title: l('固定资源版本', 'Fixed resource version'),
                  render: (_, row) => (
                    <Button
                      type="link"
                      disabled={action.busy || guard.locked}
                      onClick={() => void open(row.version)}
                    >
                      {row.version}
                    </Button>
                  ),
                },
                { title: l('Resource 版本状态', 'Resource version state'), dataIndex: 'state' },
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
        <Form
          layout="inline"
          disabled={action.busy || guard.locked}
          onFinish={() => void open(version)}
        >
          <Form.Item label={l('读取准入的固定版本', 'Fixed version for admission')}>
            <Input
              aria-label={l('读取准入的固定版本', 'Fixed version for admission')}
              value={version}
              onChange={(event) => setVersion(event.target.value)}
            />
          </Form.Item>
          <Button htmlType="submit" disabled={action.busy || guard.locked || !version}>
            {l('读取精确准入事实', 'Read exact admission facts')}
          </Button>
        </Form>
        <Failure error={action.error} locale={locale} kind="read" />
      </Card>
      {selected && (
        <AdmissionDetail
          key={JSON.stringify([
            selected.resource,
            selected.version,
            selected.resourceRevision,
            selected.lifecycle?.revision,
          ])}
          software={software}
          value={selected}
          locale={locale}
          canEnable={canEnable}
          canWithdraw={canWithdraw}
          blocked={guard.locked}
          reload={() => void open(selected.version)}
        />
      )}
    </SelectionGuard.Provider>
  )
}
export function SoftwareAdmission({
  software,
  locale,
  canEnable,
  canWithdraw,
}: {
  software: SoftwareUseCases
  locale: Locale
  canEnable: boolean
  canWithdraw: boolean
}) {
  const l = labels(locale),
    guard = useSelectionGuard(),
    [resource, setResource] = useState(''),
    [selected, setSelected] = useState('')
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('软件版本准入与撤回', 'Software version admission and withdrawal')}>
        <Form layout="inline" disabled={guard.locked} onFinish={() => setSelected(resource)}>
          <Form.Item label={l('准入资源标识', 'Admission resource ID')}>
            <Input
              aria-label={l('准入资源标识', 'Admission resource ID')}
              value={resource}
              onChange={(event) => setResource(event.target.value)}
            />
          </Form.Item>
          <Button htmlType="submit" disabled={guard.locked || !resource}>
            {l('读取此软件资源的版本', 'Read versions of this software resource')}
          </Button>
        </Form>
      </Card>
      {selected && (
        <ResourceVersions
          key={selected}
          resource={selected}
          software={software}
          locale={locale}
          canEnable={canEnable}
          canWithdraw={canWithdraw}
        />
      )}
    </SelectionGuard.Provider>
  )
}
