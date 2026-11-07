import { useCallback, useState } from 'react'
import { Alert, Button, Card, Form, Input, Popconfirm, Select, Space, Tag } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import {
  dimensions,
  risks,
  type AssetContext,
  type Dimension,
  type Risk,
  type SoftwareQuery,
} from '@rss/mdm-inventory'
import { emptyQuery } from './InventoryQuery'
import { ConditionContextEditor } from './InventoryScopeEditor'
import { Heading, labels, readFailure, ReadState, usePageRead, useRead } from './AdminUi'
import { SecretTabs } from './SecretTabs'
import { useAdministration } from './useAdministration'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import {
  AssetGroups,
  assetContexts,
  contextName,
  dimensionName,
  riskName,
  SoftwareAssetCommandState,
  StandardPicker,
  useSoftwareAssetCommand,
  type SoftwareAssetsUseCases,
} from './SoftwareAssetControls'
import { SoftwareAssetConfiguration } from './SoftwareAssetConfiguration'
import { SoftwareAssetResults } from './SoftwareAssetResults'
import type { GroupsUseCases } from './GroupPicker'
import type { Locale } from './i18n'
import type { Runtime } from './runtime'

export function SoftwareAssets({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    guard = useSelectionGuard(),
    { softwareAssets, groups, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/software-asset-permissions`, authorization.effective),
    [params, setParams] = useSearchParams(),
    [tab, setTab] = useState('query'),
    [standard, setStandard] = useState<string | null>(null),
    [mapping, setMapping] = useState<string | null>(null),
    has = (operation: string, scope: 'tenant' | 'all_devices') =>
      permissions.value?.grants.some(
        (grant) => grant.scope.kind === scope && grant.operation === operation,
      ) ?? false,
    canRead =
      has('inventory_read', 'all_devices') &&
      has('inventory_sensitive_read', 'tenant') &&
      has('group_read', 'tenant'),
    canWrite = canRead && has('inventory_software_write', 'tenant')
  usePendingSelection(guard.locked)
  function setTask(task: string) {
    const next = new URLSearchParams(params)
    if (task) next.set('task', task)
    else next.delete('task')
    setParams(next, { replace: true })
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Heading
        title={l('软件资产', 'Software assets')}
        hint={l(
          '查询已采集的安装事实，维护标准软件和映射。',
          'Query observed installations and manage standard software and mappings.',
        )}
        actions={<Link to="/inventory">{l('返回资产查询', 'Back to inventory')}</Link>}
      />
      <Button onClick={permissions.reload}>
        {l('读取软件资产权限', 'Read software asset permissions')}
      </Button>
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      {permissions.value && !canRead && (
        <Alert
          type="info"
          title={l(
            '软件资产需要全设备资产读取、敏感资产读取和组读取权限。',
            'Software assets require all-device inventory read, sensitive inventory read and group read.',
          )}
        />
      )}
      <SecretTabs
        key={binding}
        uiLocale={locale}
        authorizedKeys={canRead ? ['query', 'standards', 'mappings'] : []}
        activeKey={tab}
        onChange={(key) => {
          if (!guard.locked) setTab(key)
        }}
        items={[
          {
            key: 'query',
            label: l('软件资产查询', 'Software asset query'),
            children: (
              <SoftwareAssetQuery
                assets={softwareAssets}
                canRead={canRead}
                groups={groups}
                locale={locale}
                task={params.get('task')}
                setTask={setTask}
                openMapping={(id) => {
                  if (!guard.locked) {
                    setMapping(id)
                    setTab('mappings')
                  }
                }}
              />
            ),
          },
          {
            key: 'standards',
            label: l('标准软件', 'Standard software'),
            children: (
              <SoftwareAssetConfiguration
                assets={softwareAssets}
                canRead={canRead}
                groups={groups}
                locale={locale}
                canWrite={canWrite}
                kind="standard"
                requested={standard}
                onSelect={setStandard}
              />
            ),
          },
          {
            key: 'mappings',
            label: l('映射规则', 'Mapping rules'),
            children: (
              <SoftwareAssetConfiguration
                assets={softwareAssets}
                canRead={canRead}
                groups={groups}
                locale={locale}
                canWrite={canWrite}
                kind="mapping"
                requested={mapping}
                onSelect={setMapping}
              />
            ),
          },
        ]}
      />
    </SelectionGuard.Provider>
  )
}

function SoftwareAssetQuery({
  assets,
  canRead,
  groups,
  locale,
  task,
  setTask,
  openMapping,
}: {
  assets: SoftwareAssetsUseCases
  canRead: boolean
  groups: GroupsUseCases
  locale: Locale
  task: string | null
  setTask: (task: string) => void
  openMapping: (id: string) => void
}) {
  const l = labels(locale),
    [context, setContext] = useState<AssetContext>('associated_device'),
    [devices, setDevices] = useState(emptyQuery),
    [groupIds, setGroupIds] = useState<string[]>([]),
    [combine, setCombine] = useState<'union' | 'intersection'>('union'),
    [softwareFilter, setSoftwareFilter] = useState(''),
    [standards, setStandards] = useState<string[]>([]),
    [risk, setRisk] = useState<Risk[]>([]),
    [tags, setTags] = useState<string[]>([]),
    [split, setSplit] = useState<Dimension[]>(['version', 'component']),
    [taskInput, setTaskInput] = useState(''),
    [last, setLast] = useState<{ id: string; query: SoftwareQuery } | null>(null),
    [invalidTask, setInvalidTask] = useState<string | null>(null),
    status = usePageRead(`software-asset-task/${canRead}/${task ?? ''}`, (signal) =>
      canRead && task ? assets.status(task, signal) : Promise.resolve(null),
    ),
    command = useSoftwareAssetCommand(assets, (receipt) => {
      if (receipt.kind === 'accepted') {
        setInvalidTask(null)
        setTask(receipt.task)
      }
      status.reload()
    }),
    invalidate = useCallback(() => setInvalidTask(task), [task]),
    blocked = !canRead || command.action.busy || command.pending !== null,
    statusFailed =
      status.error &&
      (readFailure(status.error) === 'result' ||
        (typeof status.error === 'object' &&
          'status' in status.error &&
          status.error.status === 409)),
    available =
      status.value?.status === 'completed' &&
      status.value.resultState === 'retained' &&
      invalidTask !== task
  function submit() {
    if (blocked) return
    const input: SoftwareQuery = {
      context,
      devices: { filter: devices.filter, scope: devices.scope },
      groups: groupIds.length ? { combine, ids: groupIds } : null,
      software: { standards, risks: risk, tags, filter: softwareFilter.trim() || null },
      dimensions: split,
    }
    const operationId = crypto.randomUUID()
    setLast({ id: operationId, query: input })
    void command.submit({ kind: 'query', operation: { operationId, expectedRevision: 0, input } })
  }
  return (
    <>
      <Card title={l('新建软件资产查询', 'New software asset query')}>
        <Form layout="vertical" disabled={blocked} onFinish={submit}>
          <Form.Item label={l('统计域', 'Counting domain')}>
            <Select
              aria-label={l('统计域', 'Counting domain')}
              value={context}
              options={assetContexts.map((value) => ({ value, label: contextName(value, locale) }))}
              onChange={(value) => {
                setContext(value)
                setGroupIds([])
              }}
            />
          </Form.Item>
          <fieldset className="asset-editor-section">
            <legend>{l('软件条件', 'Software conditions')}</legend>
            <Form.Item label={l('单条安装记录条件（RSQL）', 'Installation record filter (RSQL)')}>
              <Input.TextArea
                aria-label={l('单条安装记录条件（RSQL）', 'Installation record filter (RSQL)')}
                value={softwareFilter}
                onChange={(e) => setSoftwareFilter(e.target.value)}
                placeholder="name=icontains='editor'"
              />
            </Form.Item>
            <StandardPicker
              assets={assets}
              locale={locale}
              value={standards}
              disabled={blocked}
              onSelect={(id) => setStandards([...standards, id])}
            />
            {standards.length > 0 && (
              <Button onClick={() => setStandards([])}>
                {l('清除标准软件条件', 'Clear standard software conditions')}
              </Button>
            )}
            <Form.Item label={l('风险', 'Risk')}>
              <Select
                mode="multiple"
                aria-label={l('风险', 'Risk')}
                value={risk}
                onChange={setRisk}
                options={risks.map((value) => ({ value, label: riskName(value, locale) }))}
              />
            </Form.Item>
            <Form.Item label={l('标签', 'Tags')}>
              <Select mode="tags" aria-label={l('标签', 'Tags')} value={tags} onChange={setTags} />
            </Form.Item>
          </fieldset>
          <fieldset className="asset-editor-section">
            <legend>{l('设备条件', 'Device conditions')}</legend>
            <Form.Item label={l('设备条件（RSQL）', 'Device filter (RSQL)')}>
              <Input.TextArea
                aria-label={l('设备条件（RSQL）', 'Device filter (RSQL)')}
                value={devices.filter ?? ''}
                onChange={(e) => setDevices({ ...devices, filter: e.target.value || null })}
              />
            </Form.Item>
            <ConditionContextEditor
              locale={locale}
              value={devices.scope}
              onChange={(scope) => setDevices({ ...devices, scope })}
            />
            <Form.Item label={l('设备组组合', 'Device group combination')}>
              <Select
                aria-label={l('设备组组合', 'Device group combination')}
                value={combine}
                onChange={setCombine}
                options={[
                  { value: 'union', label: l('任一组', 'Any group') },
                  { value: 'intersection', label: l('所有组', 'All groups') },
                ]}
              />
            </Form.Item>
            <AssetGroups
              groups={groups}
              locale={locale}
              context={context}
              ids={groupIds}
              onChange={setGroupIds}
              disabled={blocked}
            />
          </fieldset>
          <Form.Item label={l('结果分桶维度', 'Result breakdown dimensions')}>
            <Select
              mode="multiple"
              aria-label={l('结果分桶维度', 'Result breakdown dimensions')}
              value={split}
              onChange={setSplit}
              options={dimensions.map((value) => ({ value, label: dimensionName(value, locale) }))}
            />
          </Form.Item>
          <Button htmlType="submit" type="primary" disabled={blocked}>
            {l('提交软件查询', 'Submit software query')}
          </Button>
        </Form>
      </Card>
      <Card title={l('原查询任务', 'Original query task')}>
        <Form
          layout="inline"
          onFinish={() => {
            setInvalidTask(null)
            setTask(taskInput.trim())
            status.reload()
          }}
        >
          <Form.Item label={l('查询任务标识', 'Query task ID')}>
            <Input
              aria-label={l('查询任务标识', 'Query task ID')}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
            />
          </Form.Item>
          <Button htmlType="submit" disabled={blocked || !taskInput.trim()}>
            {l('打开任务', 'Open task')}
          </Button>
        </Form>
        {task && (
          <>
            <p>
              <code>{task}</code>
            </p>
            <Button disabled={blocked} onClick={status.reload}>
              {l('读取任务状态', 'Read task status')}
            </Button>
            <ReadState
              locale={locale}
              busy={status.busy}
              error={status.error}
              onRetry={status.reload}
            />
          </>
        )}
        {status.value && (
          <>
            <Space wrap>
              <Tag>{contextName(status.value.context, locale)}</Tag>
              <Tag>
                {
                  {
                    pending: l('等待中', 'Pending'),
                    running: l('运行中', 'Running'),
                    completed: l('已完成', 'Completed'),
                    failed: l('失败', 'Failed'),
                    cancelled: l('已取消', 'Cancelled'),
                  }[status.value.status]
                }
              </Tag>
              <Tag>
                {
                  {
                    retained: l('结果保留', 'Result retained'),
                    releasing: l('正在释放', 'Releasing'),
                    released: l('已释放', 'Released'),
                  }[status.value.resultState]
                }
              </Tag>
              {status.value.failure && <code>{status.value.failure}</code>}
            </Space>
            <p>
              {l('事实时间', 'Facts as of')} ·{' '}
              {new Date(status.value.asOf * 1000).toLocaleString(locale)} ·
              {l('已处理', 'Processed')} {status.value.processed} · {l('无法确定', 'Unknown')}{' '}
              {status.value.unknown}
            </p>
          </>
        )}
        {task &&
          (status.value?.resultState === 'retained' ||
            Boolean(statusFailed) ||
            (canRead && readFailure(status.error) === 'denied')) && (
            <Popconfirm
              title={l('释放所选查询结果？', 'Release the selected query result?')}
              onConfirm={() => {
                if (!task || blocked) return
                void command.submit({
                  kind: 'release',
                  id: task,
                  operation: { operationId: crypto.randomUUID(), expectedRevision: 0, input: {} },
                })
              }}
            >
              <Button disabled={blocked}>{l('释放结果', 'Release result')}</Button>
            </Popconfirm>
          )}
        <SoftwareAssetCommandState
          command={command}
          locale={locale}
          mayReplay
          reload={status.reload}
        />
        {task && (invalidTask === task || Boolean(statusFailed)) && (
          <Alert
            type="warning"
            title={l(
              '原结果已不可用，请提交新查询。',
              'The original result is unavailable. Submit a new query.',
            )}
          />
        )}
      </Card>
      {available && status.value && (
        <SoftwareAssetResults
          key={`${status.value.task}/${status.value.coordinate}`}
          assets={assets}
          task={status.value}
          locale={locale}
          invalidate={invalidate}
          requestedDimensions={last?.id === task ? last.query.dimensions : undefined}
          openMapping={openMapping}
        />
      )}
    </>
  )
}
