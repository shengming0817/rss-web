import { SelectionGuard, useSelectionGuard } from './SelectionGuard'
import { useState } from 'react'
import { Button } from 'antd'
import { SecretTabs } from './SecretTabs'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import {
  CursorControls,
  DirectoryControls,
  labels,
  ReadState,
  directoryQuery,
  type Query,
  useRead,
} from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { AppleAccounts } from './AppleAccounts'
import { AppleAde } from './AppleAde'
export function AppleEnrollment({
  runtime,
  locale,
  canWrite,
}: {
  runtime: Runtime
  locale: Locale
  canWrite: boolean
}) {
  const guard = useSelectionGuard()
  const l = labels(locale),
    { appleEnrollment: apple, binding } = useAdministration(runtime),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [selected, setSelected] = useState<string>(),
    [creating, setCreating] = useState(false),
    read = useRead(`${binding}/apple-organizations/${JSON.stringify(query)}`, () =>
      apple.organizations(directoryQuery(query, ['id', 'accountEnrollment', 'ade'] as const)),
    )
  return (
    <>
      <DirectoryControls
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={['id', 'accountEnrollment', 'ade']}
        sort={['id']}
        maximum={1000}
      />
      <Button onClick={read.reload}>{l('读取 Apple 组织', 'Read Apple organizations')}</Button>
      {canWrite && (
        <Button
          disabled={guard.locked}
          onClick={() => {
            setSelected(crypto.randomUUID())
            setCreating(true)
          }}
        >
          {l('创建 Apple 组织绑定', 'Create Apple organization binding')}
        </Button>
      )}
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            dataSource={read.value.items}
            rowKey="id"
            columns={[
              {
                title: l('组织标识', 'Organization ID'),
                dataIndex: 'id',
                render: (_, row) => (
                  <Button
                    type="link"
                    disabled={guard.locked}
                    onClick={() => {
                      setSelected(row.id)
                      setCreating(false)
                    }}
                  >
                    {row.id}
                  </Button>
                ),
              },
              {
                title: l('账户驱动', 'Account-driven'),
                render: (_, row) => row.accountEnrollment?.domain ?? '—',
              },
              {
                title: l('ADE 资格', 'ADE eligibility'),
                render: (_, row) =>
                  row.ade
                    ? l('外部资格未观察', 'External eligibility not observed')
                    : l('未配置', 'Unconfigured'),
              },
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            onChange={setQuery}
            next={read.value.nextCursor}
            count={read.value.items.length}
          />
        </>
      )}
      {selected && (
        <section className="device-editor">
          <h2>{selected}</h2>
          <SelectionGuard.Provider value={guard.register}>
            <SecretTabs
              key={selected}
              items={[
                {
                  key: 'account',
                  label: l('账户驱动接入', 'Account-driven enrollment'),
                  children: (
                    <AppleAccounts
                      runtime={runtime}
                      locale={locale}
                      organizationId={selected}
                      creating={creating}
                      canWrite={canWrite}
                      onCreated={() => {
                        setCreating(false)
                        read.reload()
                      }}
                    />
                  ),
                },
                {
                  key: 'ade',
                  label: 'ADE',
                  children: (
                    <AppleAde
                      runtime={runtime}
                      locale={locale}
                      organizationId={selected}
                      creating={creating}
                      canWrite={canWrite}
                      onCreated={() => {
                        setCreating(false)
                        read.reload()
                      }}
                    />
                  ),
                },
              ]}
            />
          </SelectionGuard.Provider>
        </section>
      )}
    </>
  )
}
