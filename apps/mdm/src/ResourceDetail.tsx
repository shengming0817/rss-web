import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogLocation } from './ResourceCatalogSearch'
import { Alert, Button, Card, Select, Space, Tag } from 'antd'
import { declarationMaterials, variantKey, type Resource } from '@rss/mdm-resources'
import { CursorControls, labels, ReadState, usePageRead, type Query } from './AdminUi'
import { CollectionPlan } from './CollectionMappingEditor'
import { DataTable } from './DataTable'
import { ResourceMetadata } from './ResourceMetadata'
import { ResourceCommandState, useResourceCommand, type ResourcesUseCases } from './ResourceCommand'
import type { Locale } from './i18n'

import { resourceName, resourceKindName } from './ResourcePresentation'
import { ResourceMaterialUpload } from './ResourceContent'
import { ResourceVersionEditor } from './ResourceVersionEditor'
import type { ContentUseCases } from './ContentUpload'

export function ResourceDetail({
  resources,
  initialVersion,
  initialVariant,
  content,
  resource,
  locale,
  canWrite,
  blocked,
  canReadSoftware,
  catalog,
}: {
  initialVersion?: string | undefined
  initialVariant?: string | undefined
  resources: ResourcesUseCases
  content: ContentUseCases
  resource: Resource
  locale: Locale
  canWrite: boolean
  blocked: boolean
  canReadSoftware: boolean
  catalog?: CatalogLocation | undefined
}) {
  const l = labels(locale),
    command = useResourceCommand(resources),
    [localVersion, setVersionId] = useState(
      initialVersion ??
        resource.versions.find((version) => version.state === 'active')?.id ??
        resource.versions[0]?.id ??
        '',
    ),
    versionId = catalog ? (initialVersion ?? localVersion) : localVersion,
    version = resource.versions.find((version) => version.id === versionId),
    [localSelection, setSelection] = useState(initialVariant ?? ''),
    selection = catalog ? (initialVariant ?? '') : localSelection,
    selected =
      version?.variants.find((variant) => variantKey(variant) === selection) ??
      (selection ? undefined : version?.variants[0])
  function locate(version: string, variant?: string) {
    if (!catalog) {
      setVersionId(version)
      setSelection(variant ?? '')
      return
    }
    const params = new URLSearchParams(catalog.params)
    params.set('version', version)
    if (variant) params.set('variant', variant)
    else params.delete('variant')
    catalog.setParams(params)
  }
  function policyLink(draft: boolean) {
    const source = new URLSearchParams(catalog?.params)
    source.set('resource', resource.id)
    source.set('version', versionId)
    if (selected) source.set('variant', variantKey(selected))
    return `/policies?${new URLSearchParams({
      softwareResource: resource.id,
      softwareVersion: versionId,
      returnTo: `/software?${source}`,
      ...(draft && selected ? { softwareVariant: variantKey(selected) } : {}),
    })}`
  }
  return (
    <div className="resource-detail">
      <div className="resource-detail-heading">
        <div>
          <h2>{resourceName(resource)}</h2>
          <p className="subtitle">
            <code>{resource.id}</code> · {resourceKindName(resource.kind, locale)} ·{' '}
            {l('存储版本', 'Storage revision')} {resource.revision}
          </p>
        </div>
        <Tag>{resourceKindName(resource.kind, locale)}</Tag>
      </div>
      {((initialVersion && !version) || (selection && !selected)) && (
        <Alert
          type="error"
          title={l(
            '所选精确版本或变体不可用，请重新选择。',
            'The exact version or variant is unavailable. Select explicitly.',
          )}
        />
      )}
      {resource.origin && (
        <Card title={l('Blueprint 来源', 'Blueprint origin')} size="small">
          <CollectionPlan value={resource.origin} />
        </Card>
      )}
      <Card title={l('精确资源版本与材料', 'Exact resource versions and materials')}>
        <div className="admin-form-grid">
          <label>
            {l('资源固定版本', 'Fixed resource version')}
            <Select
              aria-label={l('资源固定版本', 'Fixed resource version')}
              value={versionId || null}
              disabled={blocked}
              options={resource.versions.map((version) => ({
                value: version.id,
                label: `${version.id} · ${version.state}`,
              }))}
              onChange={(id) => locate(id)}
            />
          </label>
          <label>
            {l('精确变体', 'Exact variant')}
            <Select
              aria-label={l('精确变体', 'Exact variant')}
              value={selected ? variantKey(selected) : null}
              disabled={blocked}
              options={(version?.variants ?? []).map((variant) => ({
                value: variantKey(variant),
                label: `${variant.platform} / ${variant.architecture} / ${variant.key}`,
              }))}
              onChange={(variant) => locate(versionId, variant)}
            />
          </label>
        </div>
        {!version && <p className="subtitle">{l('尚无固定版本。', 'No fixed version yet.')}</p>}
        {version && (
          <>
            <p className="subtitle">
              {l('资源状态', 'Resource state')} <Tag>{version.state}</Tag> ·{' '}
              {l('冻结版本摘要', 'Frozen version digest')}{' '}
              <code>
                {version.digest.map((value) => value.toString(16).padStart(2, '0')).join('')}
              </code>
            </p>
            {catalog && (
              <Space wrap>
                {catalog.canWritePolicy && selected && version.state === 'active' && (
                  <Link to={policyLink(true)}>
                    {l('从此版本新建分配', 'Create assignment from this version')}
                  </Link>
                )}
                {catalog.canReadPolicy && (
                  <Link to={policyLink(false)}>
                    {l('查看此版本的分配', 'View assignments for this version')}
                  </Link>
                )}
              </Space>
            )}
            {selected && (
              <>
                <DataTable
                  locale={locale}
                  rowKey="reference"
                  dataSource={declarationMaterials(selected.declaration)}
                  columns={[
                    { title: l('材料引用', 'Material reference'), dataIndex: 'reference' },
                    { title: l('字节', 'Bytes'), dataIndex: 'length' },
                    {
                      title: 'SHA-256',
                      render: (_, artifact) => (
                        <code>
                          {artifact.sha256
                            .map((value) => value.toString(16).padStart(2, '0'))
                            .join('')}
                        </code>
                      ),
                    },
                  ]}
                />
                {selected.declaration.kind === 'software' && (
                  <dl className="device-facts">
                    <div>
                      <dt>{l('软件包', 'Package')}</dt>
                      <dd>{selected.declaration.definition.package}</dd>
                    </div>
                    <div>
                      <dt>{l('实际软件版本', 'Actual software version')}</dt>
                      <dd>{selected.declaration.definition.version}</dd>
                    </div>
                  </dl>
                )}
                <details>
                  <summary>{l('完整冻结定义', 'Complete frozen definition')}</summary>
                  <CollectionPlan value={selected.declaration} />
                </details>
                <ResourceMaterialUpload
                  key={JSON.stringify([
                    version.id,
                    selected.key,
                    selected.platform,
                    selected.architecture,
                  ])}
                  resources={resources}
                  content={content}
                  resource={resource}
                  version={version.id}
                  variant={selected}
                  locale={locale}
                  canWrite={canWrite}
                  blocked={blocked}
                  canDownload={selected.declaration.kind === 'script' || canReadSoftware}
                />
              </>
            )}
            <Alert
              type="info"
              title={l(
                '资源版本状态不代表内容已提交、软件已准入、来源已发布或设备已安装。',
                'Resource version state does not confirm content commit, software admission, source publication or installation on devices.',
              )}
            />
            <ResourceBlockers
              key={`${resource.id}/${version.id}`}
              resources={resources}
              id={resource.id}
              version={version.id}
              locale={locale}
            />
            <Space wrap>
              {(['activate', 'deprecate', 'archive'] as const).map((action) => (
                <Button
                  key={action}
                  danger={action === 'archive'}
                  disabled={!canWrite || blocked || command.pending !== null}
                  onClick={() =>
                    void command.submit(resource.id, resource.revision, {
                      action,
                      version: version.id,
                    })
                  }
                >
                  {action === 'activate'
                    ? l('激活此资源版本', 'Activate resource version')
                    : action === 'deprecate'
                      ? l('弃用此资源版本', 'Deprecate resource version')
                      : l('归档此资源版本', 'Archive resource version')}
                </Button>
              ))}
            </Space>
            <p className="subtitle">
              {l(
                '归档引用保护由服务端执行；列表为空或已撤回不表示没有引用。',
                'The server enforces archive reference protection, including historical and withdrawn references.',
              )}
            </p>
          </>
        )}
        <ResourceCommandState command={command} locale={locale} canWrite={canWrite} />
      </Card>
      <ResourceVersionEditor
        resources={resources}
        content={content}
        resource={resource}
        locale={locale}
        canWrite={canWrite}
        blocked={blocked}
      />
      <ResourceMetadata
        key={`${resource.id}/${resource.revision}`}
        resources={resources}
        resource={resource}
        locale={locale}
        canWrite={canWrite}
        blocked={blocked}
      />
    </div>
  )
}

function ResourceBlockers({
  resources,
  id,
  version,
  locale,
}: {
  resources: ResourcesUseCases
  id: string
  version: string
  locale: Locale
}) {
  const l = labels(locale),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = usePageRead(`resource-references/${id}/${version}/${JSON.stringify(query)}`, () =>
      resources.references(id, version, query),
    )
  return (
    <Card title={l('归档引用检查', 'Archive references')}>
      <Button onClick={read.reload}>{l('读取资源引用', 'Read resource references')}</Button>
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
            rowKey={(row) => JSON.stringify([row.kind, row.id, row.version])}
            dataSource={read.value.items}
            columns={[
              { title: l('来源类型', 'Source kind'), dataIndex: 'kind' },
              { title: l('引用身份', 'Reference identity'), dataIndex: 'id' },
              { title: l('版本', 'Version'), dataIndex: 'version' },
              { title: l('用途', 'Role'), dataIndex: 'role' },
              { title: l('保留状态', 'Retention'), dataIndex: 'retention' },
              {
                title: l('解除方式', 'Release'),
                render: (_, row) =>
                  row.release === 'retained_immutable'
                    ? l('不可变引用记录保留', 'Immutable referencing record retained')
                    : l('归档引用版本', 'Archive the referencing version'),
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
    </Card>
  )
}
