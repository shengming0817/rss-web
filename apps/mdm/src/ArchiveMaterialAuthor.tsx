import { useId, useRef, useState } from 'react'
import { Alert, Button, Card, Form, Input, InputNumber, Select, Space, Switch } from 'antd'
import {
  algorithms,
  formats,
  profiles,
  type Algorithm,
  type CertificateArchive,
  type Entry,
  type Format,
  type ImportMaterial,
  type Profile,
  type Reference,
} from '@rss/mdm-certificates/archive'
import type { Locale } from './i18n'
import { Failure, labels, useAction } from './AdminUi'
import { ArchiveCommandState, useArchiveCommand } from './ArchiveCommand'
import { ArchiveMetadata, emptyArchiveMetadata } from './ArchiveMetadata'
import { inputFingerprint, useProtectedDelivery } from './useProtectedDelivery'
import { SecretTabs } from './SecretTabs'
export function ArchiveMaterialAuthor(props: {
  archive: CertificateArchive
  entry: Entry | null
  entryId: string
  locale: Locale
  canRead: boolean
  canWrite: boolean
  unlocked: boolean
  categories: readonly string[]
  onRefresh: () => void
}) {
  const l = labels(props.locale)
  return (
    <SecretTabs
      uiLocale={props.locale}
      items={[
        {
          key: 'generate',
          label: l('生成材料', 'Generate material'),
          children: <GenerateMaterial {...props} />,
        },
        {
          key: 'import',
          label: l('导入材料', 'Import material'),
          children: <ImportMaterials {...props} />,
        },
      ]}
    />
  )
}
type Props = Parameters<typeof ArchiveMaterialAuthor>[0]
interface GenerateFields {
  profile: Profile
  algorithm: Algorithm
  commonName: string
  organization: string
  sans: string[]
  days: number
  issuer?: Reference
  scepUrl?: string
}
function GenerateMaterial({
  archive,
  entry,
  entryId,
  locale,
  canRead,
  canWrite,
  unlocked,
  categories,
  onRefresh,
}: Props) {
  const formPrefix = useId()

  const l = labels(locale),
    command = useArchiveCommand(archive),
    [form] = Form.useForm<GenerateFields>(),
    profile = Form.useWatch('profile', form) ?? 'ca',
    [metadata, setMetadata] = useState(() =>
      structuredClone(entry?.latest.metadata ?? emptyArchiveMetadata()),
    ),
    delivery = useProtectedDelivery(() => {}, canWrite && unlocked),
    disabled = !canWrite || !unlocked || command.busy || !!command.pending
  return (
    <Card
      title={
        entry
          ? l('生成新的材料版本', 'Generate a new material version')
          : l('生成证书材料', 'Generate certificate material')
      }
    >
      <p className="subtitle">
        {l(
          '生成或导入只保存档案材料。部署、APNs 签名和设备注册另行完成。新版本号由当前条目 revision 递增，可能与最近材料版本不连续。',
          'Generation and import store archive material only. Deployment, APNs signing and device enrollment are separate. Material versions advance from the current entry revision and may have gaps.',
        )}
      </p>
      <p className="mono">
        {entryId} · {l('写入基线', 'Write revision')} {entry?.revision ?? 0}
      </p>
      <Form
        name={formPrefix + '-0'}
        form={form}
        layout="vertical"
        disabled={disabled}
        initialValues={{ profile: 'ca', algorithm: 'p256', organization: '', sans: [], days: 0 }}
        onFinish={(value) => {
          if (!delivery.isCurrent(delivery.capture())) return
          void command.submit({
            kind: 'generate',
            input: {
              operationId: crypto.randomUUID(),
              entryId,
              expectedRevision: entry?.revision ?? 0,
              metadata,
              profile: value.profile,
              algorithm: value.algorithm,
              commonName: value.commonName,
              organization: value.organization ?? '',
              sans: value.profile === 'apns_csr' ? [] : (value.sans ?? []),
              days: value.days,
              issuer: value.profile === 'https' ? (value.issuer ?? null) : null,
              scepUrl: value.profile === 'scep_template' ? (value.scepUrl ?? null) : null,
            },
          })
        }}
      >
        <ArchiveMetadata
          value={metadata}
          onChange={setMetadata}
          locale={locale}
          categories={categories}
        />
        <div className="admin-form-grid">
          <Form.Item
            name="profile"
            label={l('生成类型', 'Generation profile')}
            rules={[{ required: true }]}
          >
            <Select
              options={profiles.map((profile) => ({
                value: profile,
                label:
                  profile === 'ca'
                    ? l('自签 CA', 'Self-signed CA')
                    : profile === 'https'
                      ? l('本地签发 HTTPS', 'Locally signed HTTPS')
                      : profile === 'csr'
                        ? l('证书签名申请', 'Certificate signing request')
                        : profile === 'apns_csr'
                          ? l('APNs 证书申请', 'APNs certificate request')
                          : l('SCEP 申请模板', 'SCEP request template'),
              }))}
              onChange={(value) => {
                if (value === 'apns_csr') form.setFieldsValue({ algorithm: 'rsa2048', sans: [] })
              }}
            />
          </Form.Item>
          <Form.Item
            name="algorithm"
            label={l('密钥算法', 'Key algorithm')}
            rules={[{ required: true }]}
          >
            <Select
              disabled={disabled || profile === 'apns_csr'}
              options={algorithms.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item
            name="commonName"
            label={l('通用名称 CN', 'Common name (CN)')}
            rules={[{ required: true }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item name="organization" label={l('组织 O', 'Organization (O)')}>
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item
            name="days"
            label={l('有效天数（0 使用默认值）', 'Validity days (0 uses default)')}
          >
            <InputNumber min={0} max={36500} precision={0} />
          </Form.Item>
        </div>
        {profile !== 'apns_csr' && (
          <Form.Item name="sans" label={l('SAN（DNS 名称或 IP）', 'SANs (DNS names or IPs)')}>
            <Select mode="tags" />
          </Form.Item>
        )}
        {profile === 'https' && (
          <>
            <p>
              {l(
                '必须选择含私钥的有效 CA 精确版本；签发不会申请公共 CA。',
                'Choose an exact valid CA version containing its private key. Issuance does not contact a public CA.',
              )}
            </p>
            <ReferenceFields prefix="issuer" locale={locale} />
          </>
        )}
        {profile === 'scep_template' && (
          <>
            <Alert
              type="info"
              title={l(
                '仅生成 SCEP 模板，不生成设备私钥或注册授权。',
                'Creates a SCEP template only; it does not generate a device private key or enrollment authorization.',
              )}
            />
            <Form.Item
              name="scepUrl"
              label={l('SCEP HTTPS 地址', 'SCEP HTTPS URL')}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
          </>
        )}
        <Button type="primary" htmlType="submit" disabled={disabled}>
          {l('提交生成材料', 'Submit material generation')}
        </Button>
      </Form>
      <ArchiveCommandState
        command={command}
        locale={locale}
        canRead={canRead}
        canWrite={canWrite && unlocked}
        onResolved={onRefresh}
      />
    </Card>
  )
}
interface FileRow {
  key: string
  name: string
  format: Format
  file: File | null
  password: string
}
const fileRow = (): FileRow => ({
  key: crypto.randomUUID(),
  name: '',
  format: 'certificate',
  file: null,
  password: '',
})
function ImportMaterials({
  archive,
  entry,
  entryId,
  locale,
  canRead,
  canWrite,
  unlocked,
  categories,
  onRefresh,
}: Props) {
  const formPrefix = useId()

  const l = labels(locale),
    command = useArchiveCommand(archive),
    action = useAction(),
    [metadata, setMetadata] = useState(() =>
      structuredClone(entry?.latest.metadata ?? emptyArchiveMetadata()),
    ),
    [rows, setRows] = useState<FileRow[]>([fileRow()]),
    [request, setRequest] = useState<Reference | null>(null),
    inputs = useRef(new Map<string, HTMLInputElement>()),
    buffers = useRef(new Set<ArrayBuffer>()),
    activeRows = useRef<FileRow[]>([]),
    delivery = useProtectedDelivery(clearInputs, canWrite && unlocked),
    disabled = !canWrite || !unlocked || command.busy || action.busy
  function clearInputs() {
    buffers.current.forEach((bytes) => new Uint8Array(bytes).fill(0))
    buffers.current.clear()
    activeRows.current.forEach((row) => {
      row.file = null
      row.password = ''
    })
    activeRows.current = []
    setRows((current) => current.map((row) => ({ ...row, file: null, password: '' })))
    for (const input of inputs.current.values()) input.value = ''
  }
  function update(key: string, value: Partial<FileRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...value } : row)))
  }
  async function submit() {
    const borrowed = rows.map((row) => ({ ...row })),
      materials: { name: string; bytes: ArrayBuffer; password: string | null }[] = [],
      epoch = delivery.capture()
    clearInputs()
    activeRows.current = borrowed
    try {
      const prepared = await action.run(async () => {
        if (
          !borrowed.length ||
          borrowed.length > 16 ||
          borrowed.some((row) => !row.file || !row.file.size) ||
          borrowed.reduce((sum, row) => sum + (row.file?.size ?? 0), 0) > 1024 * 1024
        )
          throw { cause: 'client', code: 'invalid_input' }
        const hashes: string[] = []
        for (const row of borrowed) {
          const bytes = await row.file!.arrayBuffer()
          if (!delivery.isCurrent(epoch)) {
            new Uint8Array(bytes).fill(0)
            return null
          }
          buffers.current.add(bytes)
          materials.push({ name: row.name, bytes, password: row.password || null })
          const digest = await crypto.subtle.digest('SHA-256', bytes)
          hashes.push(
            [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
          )
          if (!delivery.isCurrent(epoch)) return null
        }
        const fingerprint = await inputFingerprint(
          JSON.stringify(
            borrowed.map((row, index) => [row.name, row.format, hashes[index], row.password]),
          ),
        )
        if (!delivery.isCurrent(epoch)) return null
        const change = command.pending ?? {
          kind: 'import' as const,
          fingerprint,
          input: {
            operationId: crypto.randomUUID(),
            entryId,
            expectedRevision: entry?.revision ?? 0,
            metadata,
            files: borrowed.map((row) => ({ name: row.name, format: row.format })),
            requestVersion: request,
          },
        }
        return { change, fingerprint }
      })
      if (prepared.ok && prepared.value && delivery.isCurrent(epoch))
        await command.submit(prepared.value.change, {
          kind: 'import',
          materials: materials as readonly ImportMaterial[],
          fingerprint: prepared.value.fingerprint,
        })
    } finally {
      for (const material of materials) {
        new Uint8Array(material.bytes).fill(0)
        buffers.current.delete(material.bytes)
        material.password = null
      }
      borrowed.forEach((row) => {
        row.file = null
        row.password = ''
      })
      if (activeRows.current === borrowed) activeRows.current = []
    }
  }
  const pending = !!command.pending
  return (
    <Card title={l('导入证书、申请或密钥', 'Import certificates, requests or keys')}>
      <p className="subtitle">
        {l(
          '支持 PEM / DER 证书与证书链、CSR、PKCS12、私钥和不解析的原始材料。最多 16 份文件，原始内容合计不超过 1 MiB。文件密码仅用于本次解析，不保存在档案元数据中。',
          'Supports PEM / DER certificates and chains, CSRs, PKCS12, private keys and opaque material. Up to 16 files, totaling at most 1 MiB. File passwords are used for this parsing attempt and are not stored in archive metadata.',
        )}
      </p>
      <p className="mono">
        {entryId} · {l('写入基线', 'Write revision')} {entry?.revision ?? 0}
      </p>
      <Form
        name={formPrefix + '-0'}
        layout="vertical"
        disabled={disabled}
        onFinish={() => void submit()}
      >
        <fieldset className="permission-panel" disabled={disabled || pending}>
          <ArchiveMetadata
            value={metadata}
            onChange={setMetadata}
            locale={locale}
            categories={categories}
          />
        </fieldset>
        {rows.map((row, index) => (
          <fieldset className="author-record" key={row.key}>
            <legend>
              {l('材料文件', 'Material file')} {index + 1}
            </legend>
            <div className="admin-form-grid">
              <Form.Item label={l('档案文件名', 'Archive filename')} required>
                <Input
                  aria-label={`${l('档案文件名', 'Archive filename')} ${index + 1}`}
                  value={row.name}
                  disabled={disabled || pending}
                  onChange={(event) => update(row.key, { name: event.target.value })}
                />
              </Form.Item>
              <Form.Item label={l('文件格式', 'File format')}>
                <Select
                  aria-label={`${l('文件格式', 'File format')} ${index + 1}`}
                  value={row.format}
                  disabled={disabled || pending}
                  options={formats.map((value) => ({ value, label: value }))}
                  onChange={(format) => update(row.key, { format })}
                />
              </Form.Item>
            </div>
            <Form.Item label={l('选择原始文件', 'Choose original file')} required>
              <input
                aria-label={`${l('选择原始文件', 'Choose original file')} ${index + 1}`}
                type="file"
                disabled={disabled}
                ref={(input) => {
                  if (input) inputs.current.set(row.key, input)
                  else inputs.current.delete(row.key)
                }}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null
                  update(row.key, { file, ...(!row.name && file ? { name: file.name } : {}) })
                }}
              />
            </Form.Item>
            <Form.Item label={l('文件密码（需要时）', 'File password (if required)')}>
              <Input.Password
                aria-label={`${l('文件密码', 'File password')} ${index + 1}`}
                autoComplete="off"
                visibilityToggle={false}
                value={row.password}
                disabled={disabled}
                onChange={(event) => update(row.key, { password: event.target.value })}
              />
            </Form.Item>
            {!pending && rows.length > 1 && (
              <Button
                disabled={disabled}
                danger
                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
              >
                {l('移除此文件', 'Remove this file')}
              </Button>
            )}
          </fieldset>
        ))}
        <Space wrap>
          {!pending && (
            <Button
              disabled={disabled || rows.length >= 16}
              onClick={() => setRows((current) => [...current, fileRow()])}
            >
              {l('添加材料文件', 'Add material file')}
            </Button>
          )}
          <Button
            onClick={() => {
              delivery.clear()
              clearInputs()
            }}
          >
            {l('清除本地文件与密码', 'Clear local files and passwords')}
          </Button>
        </Space>
        <Form.Item label={l('关联既有 CSR 精确版本', 'Link to an exact existing CSR version')}>
          <Switch
            aria-label={l('关联既有 CSR 精确版本', 'Link to an exact existing CSR version')}
            checked={request !== null}
            disabled={disabled || pending}
            onChange={(enabled) => setRequest(enabled ? { entryId: '', version: 1 } : null)}
          />
        </Form.Item>
        {request && (
          <div className="admin-form-grid">
            <Form.Item label={l('CSR 条目 UUID', 'CSR entry UUID')}>
              <Input
                aria-label={l('CSR 条目 UUID', 'CSR entry UUID')}
                value={request.entryId}
                disabled={disabled || pending}
                onChange={(event) => setRequest({ ...request, entryId: event.target.value })}
              />
            </Form.Item>
            <Form.Item label={l('CSR 材料版本', 'CSR material version')}>
              <InputNumber
                aria-label={l('CSR 材料版本', 'CSR material version')}
                value={request.version}
                min={1}
                precision={0}
                disabled={disabled || pending}
                onChange={(version) => {
                  if (version !== null) setRequest({ ...request, version })
                }}
              />
            </Form.Item>
          </div>
        )}
        <Button type="primary" htmlType="submit" disabled={disabled}>
          {pending
            ? l('重新选择原文件并显式重提', 'Re-select original files and explicitly resubmit')
            : l('提交导入材料', 'Submit material import')}
        </Button>
      </Form>
      <Failure error={action.error} locale={locale} />
      <ArchiveCommandState
        command={command}
        locale={locale}
        canRead={canRead}
        canWrite={canWrite && unlocked}
        onResolved={onRefresh}
      />
    </Card>
  )
}
function ReferenceFields({ prefix, locale }: { prefix: string; locale: Locale }) {
  const l = labels(locale)
  return (
    <div className="admin-form-grid">
      <Form.Item
        name={[prefix, 'entryId']}
        label={l('签发 CA 条目 UUID', 'Issuer CA entry UUID')}
        rules={[{ required: true }]}
      >
        <Input />
      </Form.Item>
      <Form.Item
        name={[prefix, 'version']}
        label={l('签发 CA 精确版本', 'Exact issuer CA version')}
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} />
      </Form.Item>
    </div>
  )
}
