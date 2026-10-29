import { Checkbox, Form, Input, InputNumber, Select } from 'antd'
import type {
  CollectionScope,
  ConditionContext,
  LocalAccount,
  ScopeSelector,
} from '@rss/mdm-inventory'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { StringItems } from './ValueTypeEditor'

const account = (): LocalAccount => ({ kind: 'windows', sid: '' })
function AccountEditor({
  value,
  onChange,
  locale,
}: {
  value: LocalAccount
  onChange: (value: LocalAccount) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <Form.Item label={l('本地账户平台', 'Local account platform')}>
        <Select
          aria-label={l('本地账户平台', 'Local account platform')}
          value={value.kind}
          options={[
            { value: 'windows', label: 'Windows SID' },
            { value: 'macos', label: 'macOS UID / GeneratedUID' },
          ]}
          onChange={(kind: LocalAccount['kind']) =>
            onChange(kind === 'windows' ? account() : { kind, uid: 0, generated_uid: '' })
          }
        />
      </Form.Item>
      {value.kind === 'windows' ? (
        <Form.Item label="SID">
          <Input
            aria-label="SID"
            value={value.sid}
            onChange={(e) => onChange({ ...value, sid: e.target.value })}
          />
        </Form.Item>
      ) : (
        <>
          <Form.Item label="UID">
            <InputNumber
              aria-label="UID"
              value={value.uid}
              min={0}
              precision={0}
              onChange={(uid) => {
                if (uid !== null) onChange({ ...value, uid })
              }}
            />
          </Form.Item>
          <Form.Item label="GeneratedUID">
            <Input
              aria-label="GeneratedUID"
              value={value.generated_uid}
              onChange={(e) => onChange({ ...value, generated_uid: e.target.value })}
            />
          </Form.Item>
        </>
      )}
    </>
  )
}
function defaultScope(kind: CollectionScope['kind']): CollectionScope {
  switch (kind) {
    case 'device':
      return { kind }
    case 'native_user':
      return { kind, owner: account() }
    case 'apple_user':
      return { kind, identity: '' }
    case 'native_certificates':
      return { kind, platform: 'windows', store: '', owner: null }
    case 'native_application':
      return { kind, platform: 'windows', identity: '', owner: null }
    case 'native_accounts':
      return { kind, platform: 'windows', identities: [] }
    case 'macos_applications':
      return { kind, root: 'local', uid: null }
    case 'macos_brew':
      return { kind, package: 'formula', prefix: '', taps: [], uid: 0 }
  }
}
export function scopeName(scope: CollectionScope): string {
  switch (scope.kind) {
    case 'device':
      return 'device'
    case 'native_user':
      return `native_user / ${scope.owner.kind === 'windows' ? scope.owner.sid : `${scope.owner.uid} / ${scope.owner.generated_uid}`}`
    case 'apple_user':
      return `apple_user / ${scope.identity}`
    case 'native_certificates':
      return `${scope.kind} / ${scope.platform} / ${scope.store}${scope.owner ? ` / ${scope.owner.kind === 'windows' ? scope.owner.sid : `${scope.owner.uid} / ${scope.owner.generated_uid}`}` : ''}`
    case 'native_application':
      return `${scope.kind} / ${scope.platform} / ${scope.identity}${scope.owner ? ` / ${scope.owner.kind === 'windows' ? scope.owner.sid : `${scope.owner.uid} / ${scope.owner.generated_uid}`}` : ''}`
    case 'native_accounts':
      return `${scope.kind} / ${scope.platform} / ${scope.identities.join(' · ')}`
    case 'macos_applications':
      return `${scope.kind} / ${scope.root} / ${scope.uid ?? '—'}`
    case 'macos_brew':
      return `${scope.kind} / ${scope.package} / ${scope.prefix} / ${scope.taps.join(' · ')} / ${scope.uid}`
  }
}
export function InventoryScopeEditor({
  value,
  onChange,
  locale,
}: {
  value: CollectionScope
  onChange: (value: CollectionScope) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <fieldset className="asset-editor-section">
      <legend>{l('具体资产命名空间', 'Concrete asset namespace')}</legend>
      <Form.Item label={l('命名空间类型', 'Namespace kind')}>
        <Select
          aria-label={l('命名空间类型', 'Namespace kind')}
          value={value.kind}
          options={[
            'device',
            'native_user',
            'apple_user',
            'native_certificates',
            'native_application',
            'native_accounts',
            'macos_applications',
            'macos_brew',
          ].map((value) => ({ value, label: value }))}
          onChange={(kind: CollectionScope['kind']) => onChange(defaultScope(kind))}
        />
      </Form.Item>
      {value.kind === 'native_user' && (
        <AccountEditor
          locale={locale}
          value={value.owner}
          onChange={(owner) => onChange({ ...value, owner })}
        />
      )}
      {(value.kind === 'native_certificates' ||
        value.kind === 'native_application' ||
        value.kind === 'native_accounts') && (
        <Form.Item label={l('命名空间平台', 'Namespace platform')}>
          <Select
            aria-label={l('命名空间平台', 'Namespace platform')}
            value={value.platform}
            options={[
              { value: 'windows', label: 'Windows' },
              { value: 'macos', label: 'macOS' },
            ]}
            onChange={(platform: typeof value.platform) => onChange({ ...value, platform })}
          />
        </Form.Item>
      )}
      {(value.kind === 'apple_user' || value.kind === 'native_application') && (
        <Form.Item label={l('命名空间身份', 'Namespace identity')}>
          <Input
            aria-label={l('命名空间身份', 'Namespace identity')}
            value={value.identity}
            onChange={(e) => onChange({ ...value, identity: e.target.value })}
          />
        </Form.Item>
      )}
      {value.kind === 'native_certificates' && (
        <Form.Item label={l('证书存储区', 'Certificate store')}>
          <Input
            aria-label={l('证书存储区', 'Certificate store')}
            value={value.store}
            onChange={(e) => onChange({ ...value, store: e.target.value })}
          />
        </Form.Item>
      )}
      {(value.kind === 'native_certificates' || value.kind === 'native_application') && (
        <>
          <Checkbox
            checked={value.owner !== null}
            onChange={(e) => onChange({ ...value, owner: e.target.checked ? account() : null })}
          >
            {l('绑定本地账户', 'Bind local account')}
          </Checkbox>
          {value.owner && (
            <AccountEditor
              locale={locale}
              value={value.owner}
              onChange={(owner) => onChange({ ...value, owner })}
            />
          )}
        </>
      )}
      {value.kind === 'native_accounts' && (
        <StringItems
          locale={locale}
          label={l('账户标识', 'Account identities')}
          value={value.identities}
          onChange={(identities) => onChange({ ...value, identities })}
        />
      )}
      {value.kind === 'macos_applications' && (
        <>
          <Form.Item label={l('应用目录根', 'Application root')}>
            <Select
              aria-label={l('应用目录根', 'Application root')}
              value={value.root}
              options={['local', 'system', 'user'].map((value) => ({ value, label: value }))}
              onChange={(root: typeof value.root) => onChange({ ...value, root })}
            />
          </Form.Item>
          <Checkbox
            checked={value.uid !== null}
            onChange={(e) => onChange({ ...value, uid: e.target.checked ? 0 : null })}
          >
            {l('指定 UID', 'Specify UID')}
          </Checkbox>
          {value.uid !== null && (
            <Form.Item label="UID">
              <InputNumber
                aria-label="UID"
                value={value.uid}
                min={0}
                precision={0}
                onChange={(uid) => {
                  if (uid !== null) onChange({ ...value, uid })
                }}
              />
            </Form.Item>
          )}
        </>
      )}
      {value.kind === 'macos_brew' && (
        <>
          <Form.Item label={l('包类型', 'Package kind')}>
            <Select
              aria-label={l('包类型', 'Package kind')}
              value={value.package}
              options={[
                { value: 'formula', label: 'Formula' },
                { value: 'cask', label: 'Cask' },
              ]}
              onChange={(kind: typeof value.package) => onChange({ ...value, package: kind })}
            />
          </Form.Item>
          <Form.Item label={l('Brew 前缀', 'Brew prefix')}>
            <Input
              aria-label={l('Brew 前缀', 'Brew prefix')}
              value={value.prefix}
              onChange={(e) => onChange({ ...value, prefix: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="UID">
            <InputNumber
              aria-label="UID"
              min={0}
              precision={0}
              value={value.uid}
              onChange={(uid) => {
                if (uid !== null) onChange({ ...value, uid })
              }}
            />
          </Form.Item>
          <StringItems
            locale={locale}
            label="Taps"
            value={value.taps}
            onChange={(taps) => onChange({ ...value, taps })}
          />
        </>
      )}
    </fieldset>
  )
}
export function ConditionContextEditor({
  value,
  onChange,
  locale,
}: {
  value: ConditionContext
  onChange: (value: ConditionContext) => void
  locale: Locale
}) {
  const l = labels(locale),
    selector = value.selector
  return (
    <fieldset className="asset-editor-section">
      <legend>{l('条件上下文', 'Condition context')}</legend>
      <Form.Item label={l('资产范围', 'Asset scope')}>
        <Select
          aria-label={l('资产范围', 'Asset scope')}
          value={selector.kind}
          options={[
            { value: 'device', label: l('设备', 'Device') },
            { value: 'exact', label: l('精确命名空间', 'Exact namespace') },
            { value: 'local_user', label: l('本地用户', 'Local user') },
            {
              value: 'all_authorized',
              label: l('全部已授权命名空间', 'All authorized namespaces'),
            },
          ]}
          onChange={(kind: ScopeSelector['kind']) => {
            const selector: ScopeSelector =
              kind === 'exact'
                ? { kind, scope: { kind: 'device' } }
                : kind === 'local_user'
                  ? { kind, platform: 'windows', identity: '' }
                  : { kind }
            onChange({
              selector,
              quantifier: kind === 'device' || kind === 'exact' ? 'one' : 'any',
            })
          }}
        />
      </Form.Item>
      {selector.kind === 'exact' && (
        <InventoryScopeEditor
          locale={locale}
          value={selector.scope}
          onChange={(scope) => onChange({ ...value, selector: { ...selector, scope } })}
        />
      )}
      {selector.kind === 'local_user' && (
        <>
          <Form.Item label={l('用户平台', 'User platform')}>
            <Select
              aria-label={l('用户平台', 'User platform')}
              value={selector.platform}
              options={[
                { value: 'windows', label: 'Windows SID' },
                { value: 'macos', label: 'macOS UID' },
              ]}
              onChange={(platform: typeof selector.platform) =>
                onChange({ ...value, selector: { ...selector, platform } })
              }
            />
          </Form.Item>
          <Form.Item label={l('本地用户标识', 'Local user identity')}>
            <Input
              aria-label={l('本地用户标识', 'Local user identity')}
              value={selector.identity}
              onChange={(e) =>
                onChange({ ...value, selector: { ...selector, identity: e.target.value } })
              }
            />
          </Form.Item>
        </>
      )}
      <Form.Item label={l('匹配量词', 'Quantifier')}>
        <Select
          aria-label={l('匹配量词', 'Quantifier')}
          value={value.quantifier}
          options={(selector.kind === 'device' || selector.kind === 'exact'
            ? (['one'] as const)
            : (['any', 'all'] as const)
          ).map((value) => ({
            value,
            label: {
              one: l('当前范围', 'One scope'),
              any: l('任一范围', 'Any scope'),
              all: l('全部范围', 'All scopes'),
            }[value],
          }))}
          onChange={(quantifier: ConditionContext['quantifier']) =>
            onChange({ ...value, quantifier })
          }
        />
      </Form.Item>
    </fieldset>
  )
}
