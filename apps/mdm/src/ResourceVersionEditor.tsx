import { useRef, useState } from 'react'
import { Alert, Button, Card, Form, Input, Select, Space } from 'antd'
import {
  declarationMaterials,
  replaceDeclaration,
  validateVersionDraft,
  variantKey,
  type Declaration,
  type PreparedResourceVersion,
  type Resource,
  type ResourceVersionDraft,
  type Variant,
} from '@rss/mdm-resources'
import { useMaterialHash } from './useMaterialHash'
import type { ContentUseCases } from './ContentUpload'
import { Failure, labels, useAction, validateInput } from './AdminUi'
import { Choice, TextField } from './AuthorFields'
import { AgentAuthor, NativeAuthor, emptyApplicability, emptyBudget } from './CollectionAuthor'
import { ScriptAuthor } from './ScriptAuthor'
import { SoftwareAuthor } from './SoftwareAuthor'
import { TelemetryAuthor } from './TelemetryAuthor'
import { CollectionMappingEditor } from './CollectionMappingEditor'
import { ResourceCommandState, useResourceCommand, type ResourcesUseCases } from './ResourceCommand'
import { usePendingSelection } from './SelectionGuard'
import { useProtectedDelivery } from './useProtectedDelivery'
import { ResourceContentBatch } from './ResourceContent'
import { resourceKindName } from './ResourcePresentation'
import type { Locale } from './i18n'

const placeholder = (reference: string) => ({
  reference,
  length: 1,
  sha256: Array<number>(32).fill(0),
})
function emptyDeclaration(kind: Resource['kind'], platform: Variant['platform']): Declaration {
  const artifact = placeholder(`${kind}/content`)
  switch (kind) {
    case 'configuration':
      return { kind, artifact }
    case 'script':
      return {
        kind,
        artifact,
        definition: {
          profile: platform === 'windows' ? 'power_shell7' : 'posix_sh',
          sql: null,
          runAs: 'system',
          encoding: 'utf8',
          parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
          bindings: {},
          output: { type: 'object', properties: {} },
          purpose: { kind: 'action' },
          ...emptyBudget(),
        },
      }
    case 'agent_collection':
      return {
        kind,
        artifact,
        definition: {
          applicability: emptyApplicability(),
          plan: { version: 1, scope: { kind: 'device' }, budget: emptyBudget(), queries: {} },
          mappings: {},
        },
      }
    case 'native_collection':
      return {
        kind,
        artifact,
        definition: {
          scope: { kind: 'device' },
          applicability: emptyApplicability(),
          adapter: platform === 'windows' ? 'windows_read' : 'apple_device_information',
          mappings: {},
          timeoutSeconds: 30,
          outputBytes: 65536,
        },
      }
    case 'telemetry_profile':
      return {
        kind,
        artifact,
        definition: {
          template: { resource: '', version: '', variant: '', platform, architecture: 'x86_64' },
          parameters: {},
          fields: [],
          projection: 'both',
          sampleMillis: 30000,
          uploadMillis: 60000,
          budget: {
            points: 100,
            bytes: 65536,
            resources: 4,
            executionMillis: 1000,
            outputBytes: 65536,
          },
          boost: null,
          backfillSeconds: 3600,
        },
      }
    case 'software':
      return {
        kind,
        definition: {
          source: { id: '', revision: '', sha256: [] },
          package: '',
          version: '',
          provenance: { kind: 'private' },
          artifacts: {},
          material: {
            bundleId: null,
            format: platform === 'windows' ? 'msi' : 'pkg',
            installer: '',
          },
          behavior: null,
          signatures: [],
          reboot: 'report',
          downgrade: 'deny',
          dependencies: [],
          export: { kind: 'disabled' },
        },
      }
  }
}
export function ResourceVersionEditor({
  resources,
  content,
  resource,
  locale,
  canWrite,
  blocked,
  snapshotSeed,
}: {
  resources: ResourcesUseCases
  content: ContentUseCases
  resource: Resource
  locale: Locale
  canWrite: boolean
  blocked: boolean
  snapshotSeed?: { readonly packageId: string | null; readonly version: string | null }
}) {
  const l = labels(locale),
    action = useAction(),
    command = useResourceCommand(resources),
    [base, setBase] = useState(resource.versions[0]?.id ?? ''),
    [variants, setVariants] = useState<readonly Variant[]>(resource.versions[0]?.variants ?? []),
    [selection, setSelection] = useState(
      resource.versions[0]?.variants[0] ? variantKey(resource.versions[0].variants[0]) : '',
    ),
    [version, setVersion] = useState(''),
    [platform, setPlatform] = useState<Variant['platform']>('windows'),
    [prepared, setPrepared] = useState<PreparedResourceVersion | null>(null),
    [available, setAvailable] = useState(false),
    [texts, setTexts] = useState<Readonly<Record<string, string>>>({}),
    [buffers, setBuffers] = useState<Readonly<Record<string, ArrayBuffer>>>({}),
    held = useRef({ buffers, prepared }),
    transfer = useRef<AbortController | null>(null)
  held.current = { buffers, prepared }
  const delivery = useProtectedDelivery(() => {
    transfer.current?.abort()
    for (const bytes of Object.values(held.current.buffers)) new Uint8Array(bytes).fill(0)
    for (const material of held.current.prepared?.materials ?? [])
      new Uint8Array(material.bytes).fill(0)
    setBuffers({})
    setTexts({})
    setAvailable(false)
  }, canWrite)
  const selected = variants.find((variant) => variantKey(variant) === selection),
    locked = !canWrite || blocked || action.busy || prepared !== null || command.pending !== null
  usePendingSelection(
    action.busy ||
      (prepared !== null && command.outcome !== 'confirmed' && command.outcome !== 'rejected'),
  )
  function clearMaterials() {
    for (const bytes of Object.values(held.current.buffers)) new Uint8Array(bytes).fill(0)
    for (const material of held.current.prepared?.materials ?? [])
      new Uint8Array(material.bytes).fill(0)
    setBuffers({})
    setTexts({})
    setPrepared(null)
    setAvailable(false)
  }
  function changeDeclaration(declaration: Declaration) {
    if (selected) setVariants(replaceDeclaration(variants, selected, declaration))
  }
  function changeVariant(next: Variant) {
    if (!selected) return
    const previous = variantKey(selected),
      key = variantKey(next)
    setVariants(variants.map((item) => (item === selected ? next : item)))
    setSelection(key)
    if (previous !== key) {
      setBuffers((current) => {
        const copy = { ...current }
        if (copy[previous]) copy[key] = copy[previous]!
        delete copy[previous]
        return copy
      })
      setTexts((current) => {
        const copy = { ...current }
        if (Object.hasOwn(copy, previous)) copy[key] = copy[previous]!
        delete copy[previous]
        return copy
      })
    }
  }
  const hashSoftwareFile = useMaterialHash(canWrite, action)
  async function readScript() {
    if (!selected || selected.declaration.kind !== 'script' || !base) return
    const declaration = selected.declaration,
      generation = delivery.capture(),
      controller = new AbortController()
    transfer.current = controller
    await action.run(async () => {
      const bytes = await content.downloadBytes(
        {
          kind: 'script',
          target: {
            resource: resource.id,
            version: base,
            variant: selected.key,
            platform: selected.platform,
            architecture: selected.architecture,
            artifact: declaration.artifact,
          },
        },
        16 * 1024 * 1024,
        controller.signal,
      )
      try {
        if (!delivery.isCurrent(generation)) return
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        setTexts((current) => ({ ...current, [variantKey(selected)]: text }))
      } finally {
        new Uint8Array(bytes).fill(0)
      }
    })
    if (transfer.current === controller) transfer.current = null
  }
  async function readFile(file: File, selected: Variant) {
    const generation = delivery.capture()
    await action.run(async () => {
      validateInput(() => {
        if (!file.size || file.size > 16 * 1024 * 1024)
          throw new Error('Bounded script/configuration file required')
      })
      const bytes = await file.arrayBuffer()
      if (!delivery.isCurrent(generation)) {
        new Uint8Array(bytes).fill(0)
        return
      }
      const key = variantKey(selected)
      new Uint8Array(held.current.buffers[key] ?? new ArrayBuffer(0)).fill(0)
      setBuffers((current) => ({ ...current, [key]: bytes }))
      setTexts((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
    })
  }
  async function prepare() {
    const generation = delivery.capture(),
      owned: ArrayBuffer[] = []
    await action.run(async () => {
      try {
        const contents: ResourceVersionDraft['contents'][number][] = []
        for (const variant of variants) {
          const key = variantKey(variant),
            text = texts[key],
            stored = buffers[key]
          if (text !== undefined) {
            const encoded = new TextEncoder().encode(text),
              bytes = new ArrayBuffer(encoded.byteLength)
            new Uint8Array(bytes).set(encoded)
            encoded.fill(0)
            owned.push(bytes)
            contents.push({
              variant: variant.key,
              platform: variant.platform,
              architecture: variant.architecture,
              bytes,
            })
          } else if (stored)
            contents.push({
              variant: variant.key,
              platform: variant.platform,
              architecture: variant.architecture,
              bytes: stored,
            })
        }
        const draft: ResourceVersionDraft = {
          resource: resource.id,
          operationId: crypto.randomUUID(),
          expectedRevision: resource.revision,
          version,
          kind: resource.kind,
          variants,
          contents,
        }
        validateInput(() => validateVersionDraft(draft))
        const result = await resources.prepareVersion(draft)
        if (!delivery.isCurrent(generation)) {
          for (const material of result.materials) new Uint8Array(material.bytes).fill(0)
          return
        }
        setPrepared(result)
        setAvailable(true)
      } finally {
        for (const bytes of owned) new Uint8Array(bytes).fill(0)
      }
    })
  }
  return (
    <Card title={l('完整定义：创建新固定版本', 'Complete definition: create a new fixed version')}>
      <Alert
        type="info"
        title={l(
          '新版本保留未编辑变体与原版本。定义声明、每份内容提交、资源激活和软件准入分别确认。',
          'A new version preserves unedited variants and existing versions. Declaration, each content commit, resource activation and software admission are confirmed separately.',
        )}
      />
      <Failure error={action.error} locale={locale} />
      <fieldset className="permission-panel" disabled={locked}>
        <Form layout="vertical" disabled={locked} onFinish={() => void prepare()}>
          <div className="admin-form-grid">
            <Form.Item label={l('作者来源固定版本', 'Authoring base version')}>
              <Select
                aria-label={l('作者来源固定版本', 'Authoring base version')}
                value={base || null}
                allowClear
                options={resource.versions.map((version) => ({
                  value: version.id,
                  label: `${version.id} · ${version.state}`,
                }))}
                onChange={(id: string | undefined) => {
                  clearMaterials()
                  const value = resource.versions.find((version) => version.id === id)
                  setBase(id ?? '')
                  setVariants(value?.variants ?? [])
                  setSelection(value?.variants[0] ? variantKey(value.variants[0]) : '')
                }}
              />
            </Form.Item>
            <TextField
              label={l('新资源固定版本', 'New fixed resource version')}
              value={version}
              onChange={setVersion}
            />
          </div>
          <Space wrap>
            <Choice
              label={l('新变体平台', 'New variant platform')}
              value={platform}
              options={['windows', 'macos']}
              onChange={setPlatform}
            />
            <Button
              disabled={locked}
              onClick={() => {
                const key = `variant-${crypto.randomUUID().slice(0, 8)}`,
                  declaration = emptyDeclaration(resource.kind, platform),
                  first: Variant = { key, platform, architecture: 'x86_64', declaration }
                setVariants([
                  ...variants,
                  first,
                  ...(resource.kind === 'native_collection'
                    ? [{ ...first, architecture: 'aarch64' as const }]
                    : []),
                ])
                setSelection(variantKey(first))
              }}
            >
              {l('添加变体', 'Add variant')}{' '}
              {resource.kind === 'native_collection'
                ? l('（成对架构）', '(paired architectures)')
                : ''}
            </Button>
          </Space>
          <Form.Item label={l('编辑的精确变体', 'Exact variant to edit')}>
            <Select
              aria-label={l('编辑的精确变体', 'Exact variant to edit')}
              value={selection || null}
              options={variants.map((variant) => ({
                value: variantKey(variant),
                label: `${variant.platform} / ${variant.architecture} / ${variant.key}`,
              }))}
              onChange={setSelection}
            />
          </Form.Item>
          {selected && (
            <section className="resource-author">
              <h3>{resourceKindName(selected.declaration.kind, locale)}</h3>
              <div className="admin-form-grid">
                <TextField
                  label={l('变体键', 'Variant key')}
                  value={selected.key}
                  onChange={(key) => {
                    changeVariant({ ...selected, key })
                  }}
                />
                <Choice
                  label={l('变体平台', 'Variant platform')}
                  value={selected.platform}
                  options={['windows', 'macos']}
                  onChange={(platform) => {
                    changeVariant({ ...selected, platform })
                  }}
                />
                <Choice
                  label={l('变体架构', 'Variant architecture')}
                  value={selected.architecture}
                  options={['x86_64', 'aarch64']}
                  onChange={(architecture) => {
                    changeVariant({ ...selected, architecture })
                  }}
                />
              </div>
              <Button
                danger
                disabled={locked}
                onClick={() => {
                  setVariants(variants.filter((item) => item !== selected))
                  setSelection('')
                }}
              >
                {l('移除此变体', 'Remove this variant')}
              </Button>
              {selected.declaration.kind !== 'software' && (
                <TextField
                  label={l('作者材料引用', 'Authored material reference')}
                  value={selected.declaration.artifact.reference}
                  onChange={(reference) => {
                    if (selected.declaration.kind !== 'software')
                      changeDeclaration({
                        ...selected.declaration,
                        artifact: { ...selected.declaration.artifact, reference },
                      })
                  }}
                />
              )}
              {selected.declaration.kind === 'native_collection' && (
                <NativeAuthor
                  value={selected.declaration.definition}
                  onChange={(definition) => {
                    if (selected.declaration.kind === 'native_collection')
                      changeDeclaration({ ...selected.declaration, definition })
                  }}
                  locale={locale}
                />
              )}
              {selected.declaration.kind === 'agent_collection' && (
                <AgentAuthor
                  value={selected.declaration.definition}
                  onChange={(definition) => {
                    if (selected.declaration.kind === 'agent_collection')
                      changeDeclaration({ ...selected.declaration, definition })
                  }}
                  locale={locale}
                />
              )}
              {selected.declaration.kind === 'script' && (
                <ScriptAuthor
                  value={selected.declaration.definition}
                  onChange={(definition) => {
                    if (selected.declaration.kind === 'script')
                      changeDeclaration({ ...selected.declaration, definition })
                  }}
                  locale={locale}
                />
              )}
              {(selected.declaration.kind === 'script' ||
                selected.declaration.kind === 'native_collection' ||
                selected.declaration.kind === 'agent_collection') && (
                <CollectionMappingEditor
                  value={selected.declaration}
                  onChange={changeDeclaration}
                  locale={locale}
                />
              )}
              {selected.declaration.kind === 'telemetry_profile' && (
                <TelemetryAuthor
                  value={selected.declaration.definition}
                  onChange={(definition) => {
                    if (selected.declaration.kind === 'telemetry_profile')
                      changeDeclaration({ ...selected.declaration, definition })
                  }}
                  locale={locale}
                />
              )}
              {selected.declaration.kind === 'software' && (
                <>
                  {snapshotSeed && (
                    <Button
                      disabled={locked || (!snapshotSeed.packageId && !snapshotSeed.version)}
                      onClick={() => {
                        if (selected.declaration.kind !== 'software') return
                        changeDeclaration({
                          kind: 'software',
                          definition: {
                            ...selected.declaration.definition,
                            ...(snapshotSeed.packageId ? { package: snapshotSeed.packageId } : {}),
                            ...(snapshotSeed.version ? { version: snapshotSeed.version } : {}),
                          },
                        })
                      }}
                    >
                      {l('复制所选记录字段', 'Copy selected record fields')}
                    </Button>
                  )}
                  <SoftwareAuthor
                    onHashFile={hashSoftwareFile}
                    value={selected.declaration.definition}
                    onChange={(definition) => changeDeclaration({ kind: 'software', definition })}
                    locale={locale}
                  />
                </>
              )}
              {(selected.declaration.kind === 'script' ||
                selected.declaration.kind === 'configuration') && (
                <>
                  <Form.Item
                    label={l(
                      '新的脚本或配置文件（最大 16 MiB）',
                      'New script or configuration file (up to 16 MiB)',
                    )}
                  >
                    <input
                      type="file"
                      disabled={locked}
                      aria-label={l(
                        '新的脚本或配置文件（最大 16 MiB）',
                        'New script or configuration file (up to 16 MiB)',
                      )}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file) void readFile(file, selected)
                      }}
                    />
                  </Form.Item>
                  {selected.declaration.kind === 'script' && (
                    <>
                      <Button disabled={locked || !base} onClick={() => void readScript()}>
                        {l('读取精确原脚本供编辑', 'Read exact original script for editing')}
                      </Button>
                      <Form.Item label={l('新脚本原文', 'New script source')}>
                        <Input.TextArea
                          aria-label={l('新脚本原文', 'New script source')}
                          rows={8}
                          value={texts[variantKey(selected)] ?? ''}
                          onChange={(event) =>
                            setTexts({ ...texts, [variantKey(selected)]: event.target.value })
                          }
                        />
                      </Form.Item>
                    </>
                  )}
                  <p className="subtitle">
                    {Object.hasOwn(texts, variantKey(selected)) || buffers[variantKey(selected)]
                      ? l(
                          '新内容将在准备时计算长度与 SHA-256。',
                          'Preparation calculates the new content length and SHA-256.',
                        )
                      : l(
                          '未提供新内容时保留已存在的固定材料声明；该版本的内容绑定仍须单独确认。',
                          'Without new content, an existing fixed material declaration is preserved. This version’s content binding still requires separate confirmation.',
                        )}
                  </p>
                </>
              )}
            </section>
          )}
          <Button
            htmlType="submit"
            type="primary"
            disabled={locked || !version || !variants.length}
          >
            {l('准备完整资源版本', 'Prepare complete resource version')}
          </Button>
        </Form>
      </fieldset>
      {prepared && (
        <>
          {!available && (
            <Alert
              type="info"
              title={l(
                '材料缓冲已清除。声明保留固定摘要；上传时须重新选择并校验原材料。',
                'Material buffers were cleared. The declaration retains fixed digests; reselect and verify original materials before uploading.',
              )}
            />
          )}
          <p>
            {l('已准备版本', 'Prepared version')} <strong>{prepared.change.input.version}</strong> ·{' '}
            {prepared.change.input.variants.length} {l('个变体', 'variants')} ·{' '}
            {prepared.materials.length} {l('份已准备内容', 'prepared materials')}
          </p>
          <Space wrap>
            <Button
              disabled={!canWrite || command.pending !== null || command.action.busy}
              onClick={() =>
                void command.submitPrepared({
                  resource: prepared.resource,
                  change: prepared.change,
                })
              }
            >
              {l('声明此完整固定版本', 'Declare this complete fixed version')}
            </Button>
            <Button disabled={command.pending !== null || action.busy} onClick={clearMaterials}>
              {l('放弃未提交准备', 'Discard unsubmitted preparation')}
            </Button>
          </Space>
          <ul>
            {prepared.change.input.variants.map((variant) => (
              <li key={variantKey(variant)}>
                {variant.platform} / {variant.architecture} / {variant.key}:{' '}
                {declarationMaterials(variant.declaration)
                  .map((artifact) => artifact.reference)
                  .join(', ')}
              </li>
            ))}
          </ul>
        </>
      )}
      <ResourceCommandState command={command} locale={locale} canWrite={canWrite} />
      {prepared && command.outcome === 'confirmed' && (
        <ResourceContentBatch
          key={prepared.change.operationId}
          resources={resources}
          content={content}
          prepared={prepared}
          available={available}
          locale={locale}
          canWrite={canWrite}
          {...(base ? { scriptSourceVersion: base } : {})}
        />
      )}
    </Card>
  )
}
