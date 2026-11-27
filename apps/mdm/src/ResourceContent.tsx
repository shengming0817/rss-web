import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Select, Typography } from 'antd'
import {
  declarationMaterials,
  materialTarget,
  sameArtifact,
  type Declaration,
  type MaterialTarget,
  type PreparedResourceVersion,
  type Resource,
} from '@rss/mdm-resources'
import type { ContentReceipt, ResourceContentIntent, ResourceUploadIntent } from '@rss/mdm-content'
import { ContentDownload } from './ContentDownload'
import { ContentUpload, type ContentUseCases } from './ContentUpload'
import { bufferedMaterial, type OwnedMaterialSource } from './MaterialSource'
import { Failure, isUnknown, labels, useAction } from './AdminUi'
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
        intent: ResourceUploadIntent
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
  canMirror,
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
  canMirror: boolean
}) {
  const l = labels(locale),
    artifacts = declarationMaterials(variant.declaration),
    [reference, setReference] = useState(artifacts[0]?.reference ?? ''),
    [intent, setIntent] = useState<ResourceUploadIntent | null>(null),
    [finished, setFinished] = useState(false),
    action = useAction(),
    [mirror, setMirror] = useState<{
      request: ResourceContentIntent
      receipt: ContentReceipt | null
      rejected: boolean
    } | null>(null)
  const mirrorPending = mirror !== null && !mirror.receipt && !mirror.rejected
  usePendingSelection(action.busy || (mirrorPending && !finished))
  const selectedArtifact = artifacts.find((artifact) => artifact.reference === reference)
  const mirrorable =
    canMirror &&
    variant.declaration.kind === 'software' &&
    Object.values(variant.declaration.definition.artifacts).some(
      (artifact) => artifact.reference === reference && !!artifact.origin,
    )
  const locked = blocked || action.busy || mirrorPending || (intent !== null && !finished)
  function target() {
    return materialTarget(resource, {
      version,
      variant: variant.key,
      platform: variant.platform,
      architecture: variant.architecture,
      artifact: reference,
    })
  }
  async function readMirror(request: ResourceContentIntent) {
    const result = await action.run(() => content.receipt(request))
    if (result.ok) setMirror({ request, receipt: result.value, rejected: false })
  }
  async function startMirror() {
    if (!canWrite || !mirrorable || locked || !selectedArtifact) return
    const request = { id: crypto.randomUUID(), target: target() }
    setMirror({ request, receipt: null, rejected: false })
    const result = await action.run(() => content.mirror(request))
    if (result.ok) await readMirror(request)
    else if (!isUnknown(result.error)) setMirror({ request, receipt: null, rejected: true })
  }
  const restore = intent
    ? reconstruct(resources, content, intent.target, variant.declaration.kind)
    : undefined
  return (
    <Card size="small" title={l('交付此精确材料', 'Deliver this exact material')}>
      <Select
        aria-label={l('交付材料引用', 'Delivery material reference')}
        className="resource-material-select"
        disabled={locked}
        value={reference || null}
        options={artifacts.map((artifact) => ({
          value: artifact.reference,
          label: `${artifact.reference} · ${artifact.length}`,
        }))}
        onChange={(value) => {
          setReference(value)
          setMirror(null)
          action.clear()
        }}
      />
      <Button
        disabled={
          !canWrite ||
          !selectedArtifact ||
          action.busy ||
          (intent !== null && !finished) ||
          (blocked && !mirrorPending)
        }
        onClick={() => {
          const uploadTarget = mirrorPending ? mirror.request.target : target()
          setIntent(content.intent(crypto.randomUUID(), uploadTarget))
          setFinished(false)
        }}
      >
        {mirrorPending
          ? l('转用手工上传', 'Continue with manual upload')
          : l('准备新的材料交付', 'Prepare a new material delivery')}
      </Button>
      {mirrorable && (
        <Button disabled={!canWrite || locked} onClick={() => void startMirror()}>
          {l('镜像到内容仓', 'Mirror to content store')}
        </Button>
      )}
      {mirror && (
        <>
          <p>
            {l('原内容操作标识', 'Original content operation ID')}{' '}
            <Typography.Text code copyable={{ text: mirror.request.id }}>
              {mirror.request.id}
            </Typography.Text>
          </p>
          {mirror.receipt ? (
            <Alert
              type="success"
              title={l('产物入库已确认', 'Artifact commit confirmed')}
              description={<ContentReceiptFacts locale={locale} receipt={mirror.receipt} />}
            />
          ) : (
            <>
              {!action.busy && !mirror.rejected && (
                <p>
                  {l(
                    '镜像入库尚未确认。请查询原回执。',
                    'Mirror commit is unconfirmed. Read the original receipt.',
                  )}
                </p>
              )}
              <Button disabled={action.busy} onClick={() => void readMirror(mirror.request)}>
                {l('查询原镜像回执', 'Read original mirror receipt')}
              </Button>
            </>
          )}
          <Failure locale={locale} error={action.error} kind={mirror.rejected ? 'write' : 'read'} />
        </>
      )}
      {(variant.declaration.kind === 'script' || variant.declaration.kind === 'software') &&
        selectedArtifact && (
          <ContentDownload
            key={reference}
            content={content}
            permitted={canDownload}
            locale={locale}
            request={{
              kind: variant.declaration.kind,
              target: target(),
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
function ContentReceiptFacts({ locale, receipt }: { locale: Locale; receipt: ContentReceipt }) {
  const l = labels(locale)
  const sha256 = receipt.sha256.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return (
    <dl className="device-facts">
      <div>
        <dt>{l('原内容操作标识', 'Original content operation ID')}</dt>
        <dd>
          <code>{receipt.operationId}</code>
        </dd>
      </div>
      <div>
        <dt>{l('固定产物', 'Fixed artifact')}</dt>
        <dd>
          {receipt.resource} / {receipt.version} / {receipt.reference}
        </dd>
      </div>
      <div>
        <dt>{l('字节', 'Bytes')}</dt>
        <dd>{receipt.length}</dd>
      </div>
      <div>
        <dt>SHA-256</dt>
        <dd>
          <code>{sha256}</code>
        </dd>
      </div>
    </dl>
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
      intent: ResourceUploadIntent
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
            const session = await content.read(resource, operation)
            if (session.purpose !== 'resource') throw new Error('Wrong Resource upload purpose')
            const exact = await resources.read(resource),
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
            onChange={(event) => {
              setResource(event.target.value)
              setReceipt(null)
              action.clear()
            }}
          />
        </Form.Item>
        <Form.Item label={l('原内容操作标识', 'Original content operation ID')}>
          <Input
            aria-label={l('原内容操作标识', 'Original content operation ID')}
            value={operation}
            onChange={(event) => {
              setOperation(event.target.value)
              setReceipt(null)
              action.clear()
            }}
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
          onClick={() => {
            setReceipt(null)
            void action
              .run(() => content.originalReceipt(resource, operation))
              .then((response) => {
                if (response.ok) setReceipt(response.value)
              })
          }}
        >
          {l('查询原材料提交回执', 'Read original material commit receipt')}
        </Button>
      </Form>
      <Failure error={action.error} locale={locale} kind="read" />
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
          title={l('原材料提交已确认', 'Original material commit confirmed')}
          description={<ContentReceiptFacts locale={locale} receipt={receipt} />}
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
