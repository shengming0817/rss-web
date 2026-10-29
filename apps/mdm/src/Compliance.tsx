import { useState } from 'react'
import { Button, Card, Form, InputNumber, Space } from 'antd'
import type { Rule, RuleRow } from '@rss/mdm-compliance'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import type { ComplianceUseCases } from './ComplianceTask'
import type { GroupsUseCases } from './GroupPicker'
import {
  CursorControls,
  DirectoryControls,
  directoryQuery,
  Failure,
  firstPage,
  Heading,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
import { DataTable } from './DataTable'
import { ComplianceEditor } from './ComplianceEditor'
import { ComplianceTask } from './ComplianceTask'
import { ComplianceDeviceLookup } from './DeviceCompliance'
import { CollectionPlan } from './CollectionMappingEditor'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { SecretTabs } from './SecretTabs'
import { useAdministration } from './useAdministration'

const fields = [
  'id',
  'revision',
  'name',
  'enabled',
  'deleted',
  'severity',
  'platform',
  'targetKind',
  'definition',
] as const satisfies readonly (keyof RuleRow)[]
function RuleVersion({
  compliance,
  locale,
  id,
}: {
  compliance: ComplianceUseCases
  locale: Locale
  id: string
}) {
  const l = labels(locale),
    action = useAction(),
    [revision, setRevision] = useState<number | null>(null),
    [value, setValue] = useState<Rule | null>(null)
  return (
    <Card title={l('读取规则历史版本', 'Read a historical rule revision')}>
      <Form
        layout="inline"
        onFinish={() => {
          if (revision !== null)
            void action
              .run(() => compliance.version(id, revision))
              .then((r) => {
                setValue(r.ok ? r.value : null)
              })
        }}
      >
        <Form.Item label={l('精确规则版本', 'Exact rule revision')}>
          <InputNumber
            aria-label={l('精确规则版本', 'Exact rule revision')}
            value={revision}
            min={1}
            precision={0}
            onChange={setRevision}
          />
        </Form.Item>
        <Button disabled={revision === null || action.busy} htmlType="submit">
          {l('读取此历史定义', 'Read historical definition')}
        </Button>
      </Form>
      <Failure locale={locale} error={action.error} kind="read" />
      {value && (
        <>
          <p>
            {value.id} / {value.revision}
          </p>
          <CollectionPlan value={value.definition} />
        </>
      )}
    </Card>
  )
}
function RuleDirectory({
  compliance,
  groups,
  locale,
  canWrite,
  canRecompute,
  canChooseGroups,
}: {
  compliance: ComplianceUseCases
  groups: GroupsUseCases
  locale: Locale
  canWrite: boolean
  canRecompute: boolean
  canChooseGroups: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    guard = useSelectionGuard(),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(`compliance-rule-directory/${JSON.stringify(query)}`, () =>
      compliance.list(directoryQuery(query, fields)),
    ),
    [selected, setSelected] = useState<{ id: string; baseline: Rule | null } | null>(null),
    [editor, setEditor] = useState(0)
  usePendingSelection(guard.locked || action.busy)
  async function open(id: string) {
    const result = await action.run(() => compliance.read(id))
    if (result.ok) {
      setSelected({ id, baseline: result.value })
      setEditor((n) => n + 1)
    }
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('合规规则', 'Compliance rules')}>
        <fieldset className="permission-panel" disabled={guard.locked || action.busy}>
          <DirectoryControls
            locale={locale}
            query={query}
            onChange={setQuery}
            fields={fields}
            sort={['id', 'name', 'revision', 'enabled', 'severity', 'platform']}
          />
          <Space wrap>
            <Button onClick={read.reload}>
              {l('读取合规规则目录', 'Read compliance rule directory')}
            </Button>
            {canWrite && (
              <Button
                type="primary"
                onClick={() => {
                  setSelected({ id: crypto.randomUUID(), baseline: null })
                  setEditor((n) => n + 1)
                }}
              >
                {l('新建合规规则', 'New compliance rule')}
              </Button>
            )}
          </Space>
          <ReadState locale={locale} busy={read.busy} error={read.error} />
          {read.value && (
            <>
              <DataTable
                locale={locale}
                dataSource={read.value.items}
                rowKey="id"
                columns={[
                  {
                    title: l('规则', 'Rule'),
                    render: (_, row) => (
                      <Button type="link" onClick={() => void open(row.id)}>
                        {row.name ?? row.id}
                      </Button>
                    ),
                  },
                  { title: l('版本', 'Revision'), dataIndex: 'revision' },
                  { title: l('启用', 'Enabled'), dataIndex: 'enabled' },
                  { title: l('严重程度', 'Severity'), dataIndex: 'severity' },
                  { title: l('平台', 'Platform'), dataIndex: 'platform' },
                  { title: l('目标', 'Target'), dataIndex: 'targetKind' },
                ]}
              />
              <CursorControls
                locale={locale}
                next={read.value.nextCursor}
                count={read.value.items.length}
                query={query}
                onChange={setQuery}
              />
            </>
          )}
          {!!read.error && query.cursor && (
            <Button onClick={() => setQuery(firstPage(query))}>
              {l('规则游标失效，返回首页', 'Rule cursor expired; first page')}
            </Button>
          )}
        </fieldset>
        <Failure locale={locale} error={action.error} />
      </Card>
      {selected && (
        <div className="admin-subsection">
          <Button disabled={guard.locked || action.busy} onClick={() => setSelected(null)}>
            {l('关闭合规规则详情', 'Close compliance rule detail')}
          </Button>
          <ComplianceEditor
            key={editor}
            compliance={compliance}
            groups={groups}
            locale={locale}
            id={selected.id}
            baseline={selected.baseline}
            canWrite={canWrite}
            canRecompute={canRecompute}
            canChooseGroups={canChooseGroups}
            done={() => {
              setSelected(null)
              read.reload()
            }}
          />
          {selected.baseline && (
            <>
              <RuleVersion
                key={selected.id}
                compliance={compliance}
                locale={locale}
                id={selected.id}
              />
              <ComplianceTask
                key={`${selected.id}/lookup`}
                compliance={compliance}
                locale={locale}
                rule={selected.id}
              />
            </>
          )}
        </div>
      )}
    </SelectionGuard.Provider>
  )
}
export function Compliance({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { compliance, groups, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/compliance-presentation`, authorization.effective),
    has = (operation: string) =>
      permissions.value?.grants.some(
        (grant) => grant.scope.kind === 'tenant' && grant.operation === operation,
      ) ?? false,
    ruleRead = has('compliance_rule_read'),
    ruleWrite = has('compliance_write'),
    recompute = has('compliance_recompute'),
    deviceRead =
      permissions.value?.grants.some((grant) => grant.operation === 'compliance_read') ?? false
  return (
    <>
      <Heading
        title={l('安全与合规', 'Security and compliance')}
        hint={l(
          '根据规则版本、来源事实和评估记录检查设备合规。',
          'Inspect device compliance using rule revisions, source facts and evaluation records.',
        )}
      />
      <Button onClick={permissions.reload}>
        {l('读取合规入口权限', 'Read compliance entry permissions')}
      </Button>
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      <SecretTabs
        uiLocale={locale}
        authorizedKeys={[
          ...(ruleRead || ruleWrite || recompute ? ['rules'] : []),
          ...(deviceRead ? ['devices'] : []),
        ]}
        items={[
          {
            key: 'rules',
            label: l('规则与评估', 'Rules and evaluations'),
            children: (
              <RuleDirectory
                compliance={compliance}
                groups={groups}
                locale={locale}
                canWrite={ruleWrite}
                canRecompute={recompute}
                canChooseGroups={has('group_read')}
              />
            ),
          },
          {
            key: 'devices',
            label: l('设备结论与历史', 'Device assessments and history'),
            children: <ComplianceDeviceLookup compliance={compliance} locale={locale} />,
          },
        ]}
      />
    </>
  )
}
