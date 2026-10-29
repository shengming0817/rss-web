import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Select } from 'antd'
import {
  declarationMaterials,
  sameArtifact,
  type Declaration,
  type MaterialTarget,
  type PreparedResourceVersion,
  type Resource,
} from '@rss/mdm-resources'
import type { UploadIntent } from '@rss/mdm-content'
import { ContentDownload } from './ContentDownload'
import { ContentUpload, type ContentUseCases } from './ContentUpload'
import { bufferedMaterial, type OwnedMaterialSource } from './MaterialSource'
import { Failure, labels, useAction } from './AdminUi'
import type { ResourcesUseCases } from './ResourceCommand'
import { usePendingSelection } from './SelectionGuard'
import type { Locale } from './i18n'

function reconstruct(
  resources: ResourcesUseCases,
  content: ContentUseCases,
  target: MaterialTarget,
  kind: Declaration['kind'],
  scriptSourceVersion?: string,
): ((signal: AbortSignal) => Promise<OwnedMaterialSource>) | undefined {
  if (kind === 'script')
    return async (signal) =>
      bufferedMaterial(
        await content.downloadBytes(
          { kind, target: { ...target, version: scriptSourceVersion ?? target.version } },
          16 * 1024 * 1024,
          signal,
        ),
      )
  if (kind === 'native_collection' || kind === 'agent_collection' || kind === 'telemetry_profile')
    return async () => bufferedMaterial((await resources.reconstruct(target)).bytes)
  return undefined
}
/** A newly declared version delivers its unique immutable materials independently from the Resource receipt. */
export function ResourceContentBatch({
  resources,
  content,
  prepared,
  available,
  locale,
  canWrite,
  scriptSourceVersion,
}: {
  resources: ResourcesUseCases
  content: ContentUseCases
  prepared: PreparedResourceVersion
  available: boolean
  locale: Locale
  canWrite: boolean
  scriptSourceVersion?: string
}) {
  const l = labels(locale),
    [materials] = useState(() => {
      const targets: {
        intent: UploadIntent
        kind: Declaration['kind']
        source?: OwnedMaterialSource
      }[] = []
      for (const variant of prepared.change.input.variants)
        for (const artifact of declarationMaterials(variant.declaration)) {
          if (targets.some((entry) => sameArtifact(entry.intent.target.artifact, artifact)))
            continue
          const target: MaterialTarget = {
              resource: prepared.resource,
              version: prepared.change.input.version,
              variant: variant.key,
              platform: variant.platform,
              architecture: variant.architecture,
              artifact,
            },
            material = available
              ? prepared.materials.find((material) =>
                  sameArtifact(material.target.artifact, artifact),
                )
              : undefined
          targets.push({
            intent: content.intent(crypto.randomUUID(), target),
            kind: variant.declaration.kind,
            ...(material ? { source: bufferedMaterial(material.bytes) } : {}),
          })
        }
      return targets
    }),
    [receipts, setReceipts] = useState<readonly string[]>([])
  return (
    <Card title={l('新版本材料交付', 'New version material delivery')}>
      <Alert
        type="info"
        title={l(
          '每份材料用独立原上传标识确认业务提交。已有存储字节不代替本次完成回执。',
          'Confirm each material commit using its original upload ID. Existing storage bytes do not replace this completion acknowledgement.',
        )}
      />
      <p className="subtitle">
        {l('已确认内容回执', 'Confirmed content receipts')} {receipts.length} / {materials.length}
      </p>
      {materials.map((entry) => {
        const restore = reconstruct(
          resources,
          content,
          entry.intent.target,
          entry.kind,
          scriptSourceVersion,
        )
        return (
          <ContentUpload
            key={entry.intent.id}
            content={content}
            intent={entry.intent}
            {...(entry.source ? { initialSource: entry.source } : {})}
            {...(restore ? { restore } : {})}
            locale={locale}
            canWrite={canWrite}
            confirmed={() => setReceipts((current) => [...new Set([...current, entry.intent.id])])}
          />
        )
      })}
    </Card>
  )
}
export function ResourceMaterialUpload({
  resources,
  content,
  resource,
  version,
  variant,
  locale,
  canWrite,
  blocked,
  canDownload,
}: {
  resources: ResourcesUseCases
  content: ContentUseCases
  resource: Resource
  version: string
  variant: Resource['versions'][number]['variants'][number]
  locale: Locale
  canWrite: boolean
  blocked: boolean
  canDownload: boolean
}) {
  const l = labels(locale),
    artifacts = declarationMaterials(variant.declaration),
    [reference, setReference] = useState(artifacts[0]?.reference ?? ''),
    [intent, setIntent] = useState<UploadIntent | null>(null),
    [finished, setFinished] = useState(false)
  const restore = intent
    ? reconstruct(resources, content, intent.target, variant.declaration.kind)
    : undefined
  return (
    <Card size="small" title={l('交付此精确材料', 'Deliver this exact material')}>
      <Select
        aria-label={l('交付材料引用', 'Delivery material reference')}
        disabled={blocked || (intent !== null && !finished)}
        value={reference || null}
        options={artifacts.map((artifact) => ({
          value: artifact.reference,
          label: `${artifact.reference} · ${artifact.length}`,
        }))}
        onChange={setReference}
      />
      <Button
        disabled={!canWrite || blocked || (intent !== null && !finished) || !reference}
        onClick={() => {
          const artifact = artifacts.find((artifact) => artifact.reference === reference)
          if (!artifact) return
          setIntent(
            content.intent(crypto.randomUUID(), {
              resource: resource.id,
              version,
              variant: variant.key,
              platform: variant.platform,
              architecture: variant.architecture,
              artifact,
            }),
          )
          setFinished(false)
        }}
      >
        {l('准备新的材料交付', 'Prepare a new material delivery')}
      </Button>
      {(variant.declaration.kind === 'script' || variant.declaration.kind === 'software') &&
        artifacts.find((artifact) => artifact.reference === reference) && (
          <ContentDownload
            key={reference}
            content={content}
            permitted={canDownload}
            locale={locale}
            request={{
              kind: variant.declaration.kind,
              target: {
                resource: resource.id,
                version,
                variant: variant.key,
                platform: variant.platform,
                architecture: variant.architecture,
                artifact: artifacts.find((artifact) => artifact.reference === reference)!,
              },
            }}
          />
        )}
      {intent && (
        <ContentUpload
          key={intent.id}
          content={content}
          intent={intent}
          {...(restore ? { restore } : {})}
          locale={locale}
          canWrite={canWrite}
          confirmed={() => setFinished(true)}
          discarded={() => setIntent(null)}
        />
      )}
    </Card>
  )
}
export function ResourceContentRecovery({
  content,
  resources,
  locale,
  canWrite,
}: {
  content: ContentUseCases
  resources: ResourcesUseCases
  locale: Locale
  canWrite: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    [resource, setResource] = useState(''),
    [operation, setOperation] = useState(''),
    [original, setOriginal] = useState<{
      intent: UploadIntent
      session: Awaited<ReturnType<ContentUseCases['read']>>
      kind: Declaration['kind']
    } | null>(null),
    [finished, setFinished] = useState(false),
    [receipt, setReceipt] = useState<Awaited<
      ReturnType<ContentUseCases['originalReceipt']>
    > | null>(null)
  usePendingSelection(action.busy)
  return (
    <Card title={l('恢复原材料交付', 'Recover original material delivery')}>
      <Form
        layout="vertical"
        disabled={action.busy || original !== null}
        onFinish={() =>
          void action.run(async () => {
            const session = await content.read(resource, operation),
              exact = await resources.read(resource),
              variant = exact.versions
                .find((version) => version.id === session.target.version)
                ?.variants.find(
                  (variant) =>
                    variant.key === session.target.variant &&
                    variant.platform === session.target.platform &&
                    variant.architecture === session.target.architecture,
                )
            if (
              !variant ||
              !declarationMaterials(variant.declaration).some((artifact) =>
                sameArtifact(artifact, session.target.artifact),
              )
            )
              throw { cause: 'client', code: 'input_changed' }
            setOriginal({
              session,
              intent: content.intent(session.id, session.target),
              kind: variant.declaration.kind,
            })
          })
        }
      >
        <Form.Item label={l('恢复资源标识', 'Recovery resource ID')}>
          <Input
            aria-label={l('恢复资源标识', 'Recovery resource ID')}
            value={resource}
            onChange={(event) => setResource(event.target.value)}
          />
        </Form.Item>
        <Form.Item label={l('原内容操作标识', 'Original content operation ID')}>
          <Input
            aria-label={l('原内容操作标识', 'Original content operation ID')}
            value={operation}
            onChange={(event) => setOperation(event.target.value)}
          />
        </Form.Item>
        <Button
          htmlType="submit"
          disabled={!canWrite || !resource || !operation || action.busy || original !== null}
        >
          {l('读取原材料上传绑定', 'Read original material upload binding')}
        </Button>
        <Button
          disabled={!resource || !operation || action.busy || original !== null}
          onClick={() =>
            void action
              .run(() => content.originalReceipt(resource, operation))
              .then((response) => {
                if (response.ok) setReceipt(response.value)
              })
          }
        >
          {l('查询原材料提交回执', 'Read original material commit receipt')}
        </Button>
      </Form>
      <Failure error={action.error} locale={locale} />
      {finished && (
        <Button
          onClick={() => {
            setOriginal(null)
            setFinished(false)
            setReceipt(null)
          }}
        >
          {l('结束已确认的恢复', 'Finish acknowledged recovery')}
        </Button>
      )}
      {receipt && (
        <Alert
          type="success"
          title={`${l('原材料提交已确认', 'Original material commit confirmed')}: ${receipt.resource} / ${receipt.version} / ${receipt.reference}`}
        />
      )}
      {original &&
        (() => {
          const restore = reconstruct(resources, content, original.intent.target, original.kind)
          return (
            <ContentUpload
              key={original.intent.id}
              content={content}
              intent={original.intent}
              confirmed={() => setFinished(true)}
              initialSession={original.session}
              {...(restore ? { restore } : {})}
              locale={locale}
              canWrite={canWrite}
            />
          )
        })()}
    </Card>
  )
}
