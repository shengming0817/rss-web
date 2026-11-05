import { useState } from 'react'
import { Alert, Button, Card, Form, InputNumber, Select } from 'antd'
import { type Resource } from '@rss/mdm-resources'
import { operation } from '@rss/mdm-inventory'
import {
  validateImport,
  type ImportInput,
  type ImportReceipt,
  type SourceRow,
  type SourceView,
} from '@rss/mdm-software'
import {
  BooleanField,
  Choice,
  DigestField,
  ItemList,
  NamedRecord,
  NumberField,
  StringListField,
  TextField,
} from './AuthorFields'
import { SoftwareArtifactAuthor, emptySoftwareArtifact } from './ArtifactAuthor'
import { SoftwareBehaviorAuthor, emptySoftwareBehavior } from './SoftwareBehaviorAuthor'
import { SoftwareSignatures } from './SoftwareSignatures'
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
import { SoftwareMutationState, useSoftwareMutation, type SoftwareUseCases } from './SoftwareUi'
import type { ResourcesUseCases } from './ResourceCommand'
import type { ContentUseCases } from './ContentUpload'
import { ResourceDetail } from './ResourceDetail'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { useMaterialHash } from './useMaterialHash'
import type { Locale } from './i18n'

const sourceFields = [
  'id',
  'revision',
  'protocol',
  'state',
] as const satisfies readonly (keyof SourceRow)[]
const emptyInput = (): ImportInput => ({
  asOfUnixSeconds: Math.floor(Date.now() / 1000),
  source: { id: '', revision: '', sha256: [] },
  resource: '',
  resourceVersion: '',
  package: '',
  packageVersion: '',
  platform: 'windows',
  architecture: 'x86_64',
  variant: '',
  selection: { kind: 'winget', installerType: '', scope: '', installerId: null, files: [] },
  behavior: emptySoftwareBehavior('msi'),
  installerLength: 1,
  additionalArtifacts: {},
  dependencies: [],
  signatures: [],
  reboot: 'report',
  downgrade: 'deny',
  nativeExport: false,
})
export function SoftwareImport({
  software,
  resources,
  content,
  locale,
  canWrite,
  canReadResource,
  canReadSoftware,
}: {
  software: SoftwareUseCases
  resources: ResourcesUseCases
  content: ContentUseCases
  locale: Locale
  canWrite: boolean
  canReadResource: boolean
  canReadSoftware: boolean
}) {
  const l = labels(locale),
    guard = useSelectionGuard(),
    action = useAction(),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [sourceKey, setSourceKey] = useState(''),
    [source, setSource] = useState<SourceView | null>(null),
    sourceDirectory = useRead(`import-sources/${JSON.stringify(query)}`, () =>
      software.sources(directoryQuery(query, sourceFields)),
    ),
    [input, setInput] = useState<ImportInput>(emptyInput),
    [create, setCreate] = useState(true),
    [observedResource, setObservedResource] = useState<Resource | null>(null),
    [imported, setImported] = useState<Resource | null>(null),
    mutation = useSoftwareMutation<Record<string, never>, ImportInput, ImportReceipt>(
      (original) => software.import(original.change),
      (original) => {
        operation(original.change)
        validateImport(original.change.input)
      },
    ),
    hashFile = useMaterialHash(canWrite, action),
    locked =
      !canWrite || action.busy || mutation.action.busy || guard.locked || mutation.pending !== null,
    expectedRevision = create
      ? 0
      : observedResource?.id === input.resource
        ? observedResource.revision
        : null,
    selectedSource =
      sourceDirectory.value?.items.find(
        (row) => JSON.stringify([row.id, row.revision]) === sourceKey,
      ) ??
      (source && JSON.stringify([source.source.id, source.source.revision]) === sourceKey
        ? source.source
        : undefined),
    options = (sourceDirectory.value?.items ?? []).map((row) => ({
      value: JSON.stringify([row.id, row.revision]),
      label: `${row.id} / ${row.revision} · ${row.protocol ?? '—'} · ${row.state ?? '—'}`,
    }))
  if (
    source &&
    !options.some(
      (option) => option.value === JSON.stringify([source.source.id, source.source.revision]),
    )
  )
    options.push({
      value: JSON.stringify([source.source.id, source.source.revision]),
      label: `${source.source.id} / ${source.source.revision} · ${source.source.protocol.kind} · ${source.lifecycle.state}`,
    })
  usePendingSelection(guard.locked || action.busy)
  async function readSource() {
    if (!selectedSource) return
    const response = await action.run(() =>
      software.source(selectedSource.id, selectedSource.revision),
    )
    if (!response.ok) return
    const exact = response.value
    setSource(exact)
    setInput((current) => ({
      ...current,
      source: exact.snapshot,
      selection:
        exact.source.protocol.kind === 'brew_tap'
          ? current.selection.kind === 'brew'
            ? current.selection
            : { kind: 'brew', path: '', bottleTag: '', sourceLength: null }
          : current.selection.kind === 'winget'
            ? {
                ...current.selection,
                files:
                  exact.source.protocol.kind === 'winget_rest'
                    ? ['manifest.json']
                    : current.selection.files,
              }
            : {
                kind: 'winget',
                installerType: '',
                scope: '',
                installerId: null,
                files: exact.source.protocol.kind === 'winget_rest' ? ['manifest.json'] : [],
              },
    }))
  }
  async function readResource(imported: boolean) {
    const id =
      imported && mutation.pending ? mutation.pending.change.input.resource : input.resource
    const response = await action.run(async () => {
      const value = await resources.read(id)
      if (value.kind !== 'software') throw { cause: 'client', code: 'invalid_input' }
      return value
    })
    if (response.ok) {
      if (imported) setImported(response.value)
      else setObservedResource(response.value)
    }
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('从精确来源导入软件版本', 'Import an exact software version from a source')}>
        <Alert
          type="info"
          title={l(
            '选择已注册来源的精确快照并填写包版本。导入不会自动准入、激活或发布软件源；安装材料仍需单独交付。',
            'Select an exact registered source snapshot and package version. Import does not automatically admit, activate or publish software. Installation materials are delivered separately.',
          )}
        />
        <fieldset className="permission-panel" disabled={locked}>
          <DirectoryControls
            disabled={locked}
            locale={locale}
            query={query}
            onChange={setQuery}
            fields={sourceFields}
            sort={['id', 'revision', 'protocol', 'state']}
            maximum={100}
            required={['id', 'revision']}
          />
          <ReadState
            locale={locale}
            busy={sourceDirectory.busy}
            error={sourceDirectory.error}
            empty={sourceDirectory.value?.items.length === 0}
          />
          <Form layout="vertical" disabled={locked}>
            <Form.Item label={l('精确导入来源', 'Exact import source')}>
              <Select
                aria-label={l('精确导入来源', 'Exact import source')}
                value={sourceKey || null}
                options={options}
                onChange={(key) => {
                  setSourceKey(key)
                  setSource(null)
                }}
              />
            </Form.Item>
            <Button disabled={locked || !selectedSource} onClick={() => void readSource()}>
              {l('读取选中来源快照', 'Read selected source snapshot')}
            </Button>
          </Form>
          {sourceDirectory.value && (
            <CursorControls
              locale={locale}
              next={sourceDirectory.value.nextCursor}
              count={sourceDirectory.value.items.length}
              query={query}
              onChange={setQuery}
            />
          )}
        </fieldset>
        {source && (
          <>
            <CollectionPlan
              value={{
                source: source.source,
                snapshot: source.snapshot,
                lifecycle: source.lifecycle,
              }}
            />
            {source.source.protocol.kind === 'private' && (
              <Alert
                type="info"
                title={l(
                  '私有来源请通过资源库的完整软件定义和材料上传创建，不使用来源导入。',
                  'Create private-source software through complete Resource authoring and material upload.',
                )}
              />
            )}
            {source.lifecycle.state !== 'enabled' && (
              <Alert
                type="warning"
                title={l(
                  '此来源版本当前未启用。',
                  'This source revision is not currently enabled.',
                )}
              />
            )}
          </>
        )}
        <Failure error={action.error} locale={locale} kind="read" />
        <fieldset className="permission-panel" disabled={locked}>
          <Form
            layout="vertical"
            disabled={locked}
            onFinish={() => {
              if (
                expectedRevision !== null &&
                source &&
                source.lifecycle.state === 'enabled' &&
                source.source.protocol.kind !== 'private'
              )
                void mutation.submit({}, expectedRevision, input)
            }}
          >
            <div className="admin-form-grid">
              <TextField
                label={l('导入资源标识', 'Import resource ID')}
                value={input.resource}
                onChange={(resource) => {
                  setInput({ ...input, resource })
                  setObservedResource(null)
                }}
              />
              <TextField
                label={l('导入后的资源固定版本', 'Imported fixed resource version')}
                value={input.resourceVersion}
                onChange={(resourceVersion) => setInput({ ...input, resourceVersion })}
              />
              <TextField
                label={l('来源包标识', 'Source package identifier')}
                value={input.package}
                onChange={(next) => setInput({ ...input, package: next })}
              />
              <TextField
                label={l('来源包精确版本', 'Exact source package version')}
                value={input.packageVersion}
                onChange={(packageVersion) => setInput({ ...input, packageVersion })}
              />
            </div>
            <BooleanField
              label={l('创建新的软件资源', 'Create a new software Resource')}
              value={create}
              onChange={(create) => {
                setCreate(create)
                setObservedResource(null)
              }}
            />
            {!create && (
              <>
                <Button
                  disabled={locked || !canReadResource || !input.resource}
                  onClick={() => void readResource(false)}
                >
                  {l('读取现有软件资源存储版本', 'Read existing software Resource revision')}
                </Button>
                <p className="subtitle">
                  {l('已读取 Resource 存储版本', 'Observed Resource storage revision')}:{' '}
                  {expectedRevision ?? l('尚未读取', 'Not read')}
                </p>
              </>
            )}
            <div className="admin-form-grid">
              <Choice
                label={l('导入平台', 'Import platform')}
                value={input.platform}
                options={['windows', 'macos']}
                onChange={(platform) => setInput({ ...input, platform })}
              />
              <Choice
                label={l('导入架构', 'Import architecture')}
                value={input.architecture}
                options={['x86_64', 'aarch64']}
                onChange={(architecture) => setInput({ ...input, architecture })}
              />
              <TextField
                label={l('导入变体键', 'Import variant key')}
                value={input.variant}
                onChange={(variant) => setInput({ ...input, variant })}
              />
              <NumberField
                label={l('转换时点（Unix 秒）', 'Conversion as-of time (Unix seconds)')}
                value={input.asOfUnixSeconds}
                onChange={(asOfUnixSeconds) => setInput({ ...input, asOfUnixSeconds })}
              />
              <NumberField
                label={l('安装材料字节', 'Installer material bytes')}
                value={input.installerLength}
                minimum={1}
                onChange={(installerLength) => setInput({ ...input, installerLength })}
              />
            </div>
            <label className="content-file">
              {l('从安装文件计算材料长度', 'Calculate material length from the installer file')}
              <input
                type="file"
                aria-label={l('计算导入安装材料长度', 'Calculate imported installer length')}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file)
                    hashFile(file, ({ length }) => setInput({ ...input, installerLength: length }))
                }}
              />
            </label>
            <Card size="small" title={l('精确来源选择', 'Exact source selection')}>
              {input.selection.kind === 'winget' ? (
                <>
                  <TextField
                    label={l('WinGet 安装器类型', 'WinGet installer type')}
                    value={input.selection.installerType}
                    onChange={(installerType) => {
                      if (input.selection.kind === 'winget')
                        setInput({ ...input, selection: { ...input.selection, installerType } })
                    }}
                  />
                  <TextField
                    label={l('WinGet 安装范围', 'WinGet installer scope')}
                    value={input.selection.scope}
                    onChange={(scope) => {
                      if (input.selection.kind === 'winget')
                        setInput({ ...input, selection: { ...input.selection, scope } })
                    }}
                  />
                  <TextField
                    label={l('WinGet 安装器标识（可选）', 'WinGet installer ID (optional)')}
                    value={input.selection.installerId ?? ''}
                    onChange={(installerId) => {
                      if (input.selection.kind === 'winget')
                        setInput({
                          ...input,
                          selection: { ...input.selection, installerId: installerId || null },
                        })
                    }}
                  />
                  {source?.source.protocol.kind === 'winget_rest' ? (
                    <p className="subtitle">
                      {l(
                        'REST 来源的固定元数据文档',
                        'Fixed metadata document for the REST source',
                      )}
                      : <code>manifest.json</code>
                    </p>
                  ) : (
                    <StringListField
                      locale={locale}
                      label={l('精确清单文件', 'Exact manifest files')}
                      value={input.selection.files}
                      onChange={(files) => {
                        if (input.selection.kind === 'winget')
                          setInput({ ...input, selection: { ...input.selection, files } })
                      }}
                    />
                  )}
                </>
              ) : (
                <>
                  <TextField
                    label={l('Brew 清单路径', 'Brew manifest path')}
                    value={input.selection.path}
                    onChange={(path) => {
                      if (input.selection.kind === 'brew')
                        setInput({ ...input, selection: { ...input.selection, path } })
                    }}
                  />
                  <TextField
                    label={l('Brew Bottle 标签', 'Brew bottle tag')}
                    value={input.selection.bottleTag}
                    onChange={(bottleTag) => {
                      if (input.selection.kind === 'brew')
                        setInput({ ...input, selection: { ...input.selection, bottleTag } })
                    }}
                  />
                  <Form.Item
                    label={l('Brew 源材料字节（可选）', 'Brew source material bytes (optional)')}
                  >
                    <InputNumber
                      aria-label={l(
                        'Brew 源材料字节（可选）',
                        'Brew source material bytes (optional)',
                      )}
                      min={1}
                      precision={0}
                      value={input.selection.sourceLength}
                      onChange={(sourceLength) => {
                        if (input.selection.kind === 'brew')
                          setInput({ ...input, selection: { ...input.selection, sourceLength } })
                      }}
                    />
                  </Form.Item>
                </>
              )}
            </Card>
            <SoftwareBehaviorAuthor
              value={input.behavior}
              onChange={(behavior) => setInput({ ...input, behavior })}
              locale={locale}
            />
            <NamedRecord
              label={l('导入附加材料', 'Additional import materials')}
              value={input.additionalArtifacts}
              onChange={(additionalArtifacts) => setInput({ ...input, additionalArtifacts })}
              create={emptySoftwareArtifact}
              locale={locale}
            >
              {(material, update, key) => (
                <SoftwareArtifactAuthor
                  value={material}
                  onChange={update}
                  locale={locale}
                  label={key}
                  onHashFile={hashFile}
                />
              )}
            </NamedRecord>
            <ItemList
              label={l('导入精确依赖', 'Exact import dependencies')}
              value={input.dependencies}
              onChange={(dependencies) => setInput({ ...input, dependencies })}
              create={() => ({
                package: '',
                packageVersion: '',
                resource: '',
                version: '',
                sha256: [] as readonly number[],
              })}
              locale={locale}
            >
              {(dependency, update) => (
                <>
                  <TextField
                    label={l('依赖包标识', 'Dependency package identifier')}
                    value={dependency.package}
                    onChange={(next) => update({ ...dependency, package: next })}
                  />
                  <TextField
                    label={l('依赖包版本', 'Dependency package version')}
                    value={dependency.packageVersion}
                    onChange={(packageVersion) => update({ ...dependency, packageVersion })}
                  />
                  <TextField
                    label={l('依赖资源标识', 'Dependency resource ID')}
                    value={dependency.resource}
                    onChange={(resource) => update({ ...dependency, resource })}
                  />
                  <TextField
                    label={l('依赖资源固定版本', 'Fixed dependency resource version')}
                    value={dependency.version}
                    onChange={(version) => update({ ...dependency, version })}
                  />
                  <DigestField
                    label={l('依赖资源版本摘要', 'Dependency resource version digest')}
                    value={dependency.sha256}
                    onChange={(sha256) => update({ ...dependency, sha256 })}
                  />
                </>
              )}
            </ItemList>
            <SoftwareSignatures
              value={input.signatures}
              onChange={(signatures) => setInput({ ...input, signatures })}
              locale={locale}
              onHashFile={hashFile}
            />
            <div className="admin-form-grid">
              <Choice
                label={l('导入重启处理', 'Import reboot handling')}
                value={input.reboot}
                options={['forbid', 'report']}
                onChange={(reboot) => setInput({ ...input, reboot })}
              />
              <Choice
                label={l('导入降级处理', 'Import downgrade handling')}
                value={input.downgrade}
                options={['deny', 'allow']}
                onChange={(downgrade) => setInput({ ...input, downgrade })}
              />
            </div>
            <BooleanField
              label={l('生成原生源导出定义', 'Generate a native-source export definition')}
              value={input.nativeExport}
              onChange={(nativeExport) => setInput({ ...input, nativeExport })}
            />
            <Button
              type="primary"
              htmlType="submit"
              disabled={
                locked ||
                !source ||
                source.lifecycle.state !== 'enabled' ||
                source.source.protocol.kind === 'private' ||
                expectedRevision === null
              }
            >
              {l('提交精确软件导入', 'Submit exact software import')}
            </Button>
          </Form>
        </fieldset>
        <SoftwareMutationState
          mutation={mutation}
          locale={locale}
          canReplay={canWrite}
          confirmedText={l(
            '精确导入回执已确认。安装材料、软件准入与源发布仍分别确认。',
            'Exact import acknowledged. Confirm installation materials, admission and source publication separately.',
          )}
          lookup={(original) => resources.read(original.change.input.resource)}
          lookupLabel={l('读取原导入资源当前状态', 'Read current Resource for original import')}
          blocked={guard.locked}
          done={() => {
            setImported(null)
            setObservedResource(null)
          }}
        />
        {mutation.result && (
          <>
            <p className="subtitle">
              {l('导入回执存储版本', 'Import receipt storage revision')}{' '}
              {mutation.result.storageRevision}
            </p>
            <Button
              disabled={!canReadResource || action.busy || guard.locked}
              onClick={() => void readResource(true)}
            >
              {l('读取导入资源与材料', 'Read imported Resource and materials')}
            </Button>
          </>
        )}
      </Card>
      {imported && (
        <ResourceDetail
          key={`${imported.id}/${imported.revision}`}
          resources={resources}
          content={content}
          resource={imported}
          locale={locale}
          canWrite={canWrite}
          canReadSoftware={canReadSoftware}
          blocked={guard.locked}
        />
      )}
    </SelectionGuard.Provider>
  )
}
