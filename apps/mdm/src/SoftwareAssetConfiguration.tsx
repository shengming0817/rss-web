import { useState } from 'react'
import { Button, Card, Checkbox, Form, Input, InputNumber, Popconfirm, Select, Space } from 'antd'
import type { Page } from '@rss/mdm-devices'
import {
  risks,
  sources,
  type Assessment,
  type Risk,
  type SoftwareMapping,
  type SoftwareRecord,
  type StandardSoftware,
} from '@rss/mdm-inventory'
import { CursorControls, labels, ReadState, usePageRead, type Query } from './AdminUi'
import { DataTable } from './DataTable'
import type { GroupsUseCases } from './GroupPicker'
import {
  AssetGroups,
  assetContexts,
  contextName,
  firstAssetPage,
  riskName,
  SoftwareAssetCommandState,
  StandardPicker,
  useSoftwareAssetCommand,
  type SoftwareAssetsUseCases,
} from './SoftwareAssetControls'
import type { Locale } from './i18n'

export function SoftwareAssetConfiguration({
  assets,
  groups,
  locale,
  canWrite,
  canRead,
  kind,
  requested,
  onSelect,
}: {
  assets: SoftwareAssetsUseCases
  groups: GroupsUseCases
  locale: Locale
  canWrite: boolean
  canRead: boolean
  kind: 'standard' | 'mapping'
  requested: string | null
  onSelect: (id: string | null) => void
}) {
  const l = labels(locale),
    [query, setQuery] = useState<Query>(firstAssetPage),
    [creating, setCreating] = useState(false),
    [epoch, setEpoch] = useState(0),
    list = usePageRead<Page<SoftwareRecord<StandardSoftware | SoftwareMapping>> | null>(
      `software-config/${canRead}/${kind}/${epoch}/${JSON.stringify(query)}`,
      (signal) =>
        !canRead
          ? Promise.resolve(null)
          : kind === 'standard'
            ? assets.standards(query, signal)
            : assets.mappings(query, signal),
    ),
    detail = usePageRead<SoftwareRecord<StandardSoftware | SoftwareMapping> | null>(
      `software-config-detail/${canRead}/${kind}/${epoch}/${requested ?? ''}`,
      (signal) => {
        if (!canRead || !requested || creating) return Promise.resolve(null)
        return kind === 'standard'
          ? assets.standard(requested, signal)
          : assets.mapping(requested, signal)
      },
    ),
    command = useSoftwareAssetCommand(assets, () => {
      setEpoch((v) => v + 1)
      setQuery(firstAssetPage)
      setCreating(false)
      onSelect(null)
    }),
    blocked = !canRead || command.action.busy || command.pending !== null,
    editable = canWrite && !blocked
  function newId() {
    return requested ?? crypto.randomUUID()
  }
  function refresh() {
    setEpoch((v) => v + 1)
    setQuery(firstAssetPage)
  }
  const target = detail.value?.definition
  return (
    <Card
      title={
        kind === 'standard'
          ? l('标准软件目录', 'Standard software directory')
          : l('映射规则目录', 'Mapping rule directory')
      }
    >
      <Space wrap>
        <Button disabled={blocked} onClick={refresh}>
          {l('刷新目录', 'Refresh directory')}
        </Button>
        {canWrite && (
          <Button
            disabled={blocked}
            onClick={() => {
              onSelect(null)
              setCreating(true)
            }}
          >
            {kind === 'standard'
              ? l('新建标准软件', 'New standard software')
              : l('新建映射', 'New mapping')}
          </Button>
        )}
      </Space>
      <ReadState
        locale={locale}
        busy={list.busy}
        error={list.error}
        empty={list.value?.items.length === 0}
        onRetry={list.reload}
        onRestart={refresh}
      />
      {list.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="id"
            dataSource={list.value.items}
            columns={[
              {
                title: l('对象', 'Object'),
                render: (_, row) => (
                  <Button
                    type="link"
                    disabled={blocked || !row.definition}
                    onClick={() => {
                      setCreating(false)
                      onSelect(row.id)
                    }}
                  >
                    {row.definition && 'name' in row.definition ? row.definition.name : row.id}
                  </Button>
                ),
              },
              { title: l('修订', 'Revision'), dataIndex: 'revision' },
              {
                title: l('风险或规则', 'Risk or rule'),
                render: (_, row) =>
                  row.definition ? (
                    'risk' in row.definition ? (
                      riskName(row.definition.risk, locale)
                    ) : (
                      <code>{row.definition.filter}</code>
                    )
                  ) : (
                    l('已删除', 'Deleted')
                  ),
              },
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            next={list.value.nextCursor}
            count={list.value.items.length}
            onChange={setQuery}
          />
        </>
      )}
      {requested && (
        <ReadState
          locale={locale}
          busy={detail.busy}
          error={detail.error}
          onRetry={detail.reload}
        />
      )}
      {canRead && (creating || target) && (
        <Card size="small" title={requested ?? l('新建配置', 'New configuration')}>
          {kind === 'standard' ? (
            <StandardEditor
              key={`${requested ?? 'new'}/${detail.value?.revision ?? 0}`}
              initial={target && 'risk' in target ? target : null}
              groups={groups}
              locale={locale}
              editable={editable}
              save={(definition) =>
                void command.submit({
                  kind,
                  id: newId(),
                  operation: {
                    operationId: crypto.randomUUID(),
                    expectedRevision: detail.value?.revision ?? 0,
                    input: { action: 'put', definition },
                  },
                })
              }
            />
          ) : (
            <MappingEditor
              key={`${requested ?? 'new'}/${detail.value?.revision ?? 0}`}
              initial={target && 'filter' in target ? target : null}
              assets={assets}
              locale={locale}
              editable={editable}
              save={(definition) =>
                void command.submit({
                  kind,
                  id: newId(),
                  operation: {
                    operationId: crypto.randomUUID(),
                    expectedRevision: detail.value?.revision ?? 0,
                    input: { action: 'put', definition },
                  },
                })
              }
            />
          )}
          <Space wrap>
            {canWrite && detail.value?.definition && (
              <Popconfirm
                title={l('删除所选配置？', 'Delete the selected configuration?')}
                onConfirm={() => {
                  if (!detail.value || blocked) return
                  const operation = {
                    operationId: crypto.randomUUID(),
                    expectedRevision: detail.value.revision,
                    input: { action: 'delete' as const },
                  }
                  void command.submit({ kind, id: detail.value.id, operation })
                }}
              >
                <Button danger disabled={blocked}>
                  {l('删除配置', 'Delete configuration')}
                </Button>
              </Popconfirm>
            )}
            <Button
              disabled={blocked}
              onClick={() => {
                setCreating(false)
                onSelect(null)
              }}
            >
              {l('关闭配置', 'Close configuration')}
            </Button>
            {requested && (
              <Button disabled={blocked} onClick={refresh}>
                {l('重新读取配置', 'Read configuration again')}
              </Button>
            )}
          </Space>
        </Card>
      )}
      <SoftwareAssetCommandState
        command={command}
        locale={locale}
        mayReplay={canWrite}
        reload={refresh}
      />
    </Card>
  )
}

function StandardEditor({
  initial,
  groups,
  locale,
  editable,
  save,
}: {
  initial: StandardSoftware | null
  groups: GroupsUseCases
  locale: Locale
  editable: boolean
  save: (definition: StandardSoftware) => void
}) {
  const l = labels(locale),
    [name, setName] = useState(initial?.name ?? ''),
    [risk, setRisk] = useState<Risk | undefined>(initial?.risk),
    [tags, setTags] = useState(initial?.tags ?? []),
    [endpoint, setEndpoint] = useState<Assessment>(
      initial?.assessments.endpoint ?? { threshold: null, allowedGroups: null },
    ),
    [associatedDevice, setAssociated] = useState<Assessment>(
      initial?.assessments.associatedDevice ?? { threshold: null, allowedGroups: null },
    ),
    valid =
      risk &&
      name.trim() &&
      [endpoint, associatedDevice].every(
        (value) =>
          (value.allowedGroups === null || value.allowedGroups.length > 0) &&
          (value.threshold === null ||
            (Number.isSafeInteger(value.threshold) &&
              value.threshold >= 1 &&
              value.threshold <= 1_000_000)),
      )
  return (
    <Form
      layout="vertical"
      disabled={!editable}
      onFinish={() => {
        if (valid && risk && editable)
          save({ name: name.trim(), risk, tags, assessments: { endpoint, associatedDevice } })
      }}
    >
      <div className="admin-form-grid">
        <Form.Item label={l('标准软件名称', 'Standard software name')} required>
          <Input
            aria-label={l('标准软件名称', 'Standard software name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Form.Item>
        <Form.Item label={l('风险', 'Risk')} required>
          <Select
            aria-label={l('风险', 'Risk')}
            value={risk}
            onChange={setRisk}
            options={risks.map((value) => ({ value, label: riskName(value, locale) }))}
          />
        </Form.Item>
        <Form.Item label={l('标签', 'Tags')}>
          <Select mode="tags" aria-label={l('标签', 'Tags')} value={tags} onChange={setTags} />
        </Form.Item>
      </div>
      {assetContexts.map((context) => {
        const [value, change] =
          context === 'endpoint' ? [endpoint, setEndpoint] : [associatedDevice, setAssociated]
        const domain = contextName(context, locale)
        return (
          <fieldset key={context} className="asset-editor-section">
            <legend>{domain}</legend>
            <Form.Item label={l('预警阈值（留空关闭）', 'Alert threshold (empty disables it)')}>
              <InputNumber
                aria-label={domain + ' ' + l('预警阈值', 'Alert threshold')}
                min={1}
                max={1_000_000}
                precision={0}
                value={value.threshold}
                onChange={(threshold) => change({ ...value, threshold })}
              />
            </Form.Item>
            <Checkbox
              checked={value.allowedGroups !== null}
              onChange={(e) => change({ ...value, allowedGroups: e.target.checked ? [] : null })}
            >
              {l('仅允许所选组安装（任一组匹配）', 'Allow installation in any selected group')}
            </Checkbox>
            {value.allowedGroups !== null && (
              <AssetGroups
                groups={groups}
                locale={locale}
                context={context}
                ids={value.allowedGroups}
                disabled={!editable}
                onChange={(allowedGroups) => change({ ...value, allowedGroups })}
              />
            )}
          </fieldset>
        )
      })}
      <Button htmlType="submit" type="primary" disabled={!editable || !valid}>
        {l('保存标准软件', 'Save standard software')}
      </Button>
    </Form>
  )
}

function MappingEditor({
  initial,
  assets,
  locale,
  editable,
  save,
}: {
  initial: SoftwareMapping | null
  assets: SoftwareAssetsUseCases
  locale: Locale
  editable: boolean
  save: (definition: SoftwareMapping) => void
}) {
  const l = labels(locale),
    [value, setValue] = useState<SoftwareMapping>(
      initial ?? {
        standard: '',
        enabled: true,
        source: sources[0],
        platform: 'windows',
        origin: null,
        filter: '',
      },
    ),
    valid =
      value.standard && value.filter.trim() && (value.source !== sources[0] || value.origin?.trim())
  return (
    <Form
      layout="vertical"
      disabled={!editable}
      onFinish={() => {
        if (editable && valid)
          save({ ...value, origin: value.origin?.trim() || null, filter: value.filter.trim() })
      }}
    >
      <Form.Item label={l('标准软件', 'Standard software')} required>
        <StandardPicker
          assets={assets}
          locale={locale}
          value={value.standard ? [value.standard] : []}
          onSelect={(standard) => setValue({ ...value, standard })}
          disabled={!editable}
        />
      </Form.Item>
      <div className="admin-form-grid">
        <Form.Item label={l('采集字段', 'Collection field')}>
          <Select
            aria-label={l('采集字段', 'Collection field')}
            value={value.source}
            options={sources.map((source) => ({ value: source, label: source }))}
            onChange={(source) =>
              setValue({
                ...value,
                source,
                platform: source.includes('.apple.')
                  ? 'macos'
                  : source.includes('.windows.')
                    ? 'windows'
                    : value.platform,
              })
            }
          />
        </Form.Item>
        <Form.Item label={l('平台', 'Platform')}>
          <Select
            aria-label={l('平台', 'Platform')}
            value={value.platform}
            disabled={value.source !== sources[0]}
            options={['windows', 'macos'].map((platform) => ({ value: platform, label: platform }))}
            onChange={(platform) => setValue({ ...value, platform })}
          />
        </Form.Item>
        <Form.Item label={l('来源标识', 'Origin')} required={value.source === sources[0]}>
          <Input
            aria-label={l('来源标识', 'Origin')}
            value={value.origin ?? ''}
            onChange={(e) => setValue({ ...value, origin: e.target.value })}
          />
        </Form.Item>
      </div>
      <Form.Item
        label={l('单条安装记录条件（RSQL）', 'Installation record filter (RSQL)')}
        required
      >
        <Input.TextArea
          aria-label={l('单条安装记录条件（RSQL）', 'Installation record filter (RSQL)')}
          value={value.filter}
          onChange={(e) => setValue({ ...value, filter: e.target.value })}
          placeholder="nativeId=='example'"
        />
      </Form.Item>
      <Checkbox
        checked={value.enabled}
        onChange={(e) => setValue({ ...value, enabled: e.target.checked })}
      >
        {l('启用映射', 'Enable mapping')}
      </Checkbox>
      <Button htmlType="submit" type="primary" disabled={!editable || !valid}>
        {l('保存映射', 'Save mapping')}
      </Button>
    </Form>
  )
}
