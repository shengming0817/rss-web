import { Button } from 'antd'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Heading, labels, ReadState, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { SecretTabs } from './SecretTabs'
import { InventoryQuery } from './InventoryQuery'
import { SavedQueries } from './SavedQueries'
import { FieldCatalog } from './FieldCatalog'
import { FieldLayout } from './FieldLayout'
import { CollectionMappings } from './CollectionMappings'

export function Inventory({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { inventory, mappings, content, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/inventory-presentation`, authorization.effective),
    tenant = (operation: string) =>
      permissions.value?.grants.some(
        (grant) => grant.scope.kind === 'tenant' && grant.operation === operation,
      ) ?? false,
    canRead =
      permissions.value?.grants.some((grant) => grant.operation === 'inventory_read') ?? false,
    fieldsWrite = tenant('inventory_fields_write'),
    resourceRead = tenant('resource_read'),
    resourceWrite = tenant('resource_write')
  return (
    <>
      <Heading
        title={l('资产查询', 'Inventory')}
        hint={l(
          '查询授权范围内的资产事实，管理字段与采集映射。',
          'Query authorized asset facts and manage fields and collection mappings.',
        )}
      />
      <Button onClick={permissions.reload}>
        {l('读取资产入口权限', 'Read inventory entry permissions')}
      </Button>
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      <SecretTabs
        uiLocale={locale}
        authorizedKeys={[
          ...(canRead ? ['query', 'saved'] : []),
          ...(canRead || fieldsWrite ? ['fields', 'layout'] : []),
          ...(resourceRead ? ['mappings'] : []),
        ]}
        items={[
          {
            key: 'query',
            label: l('资产查询', 'Asset query'),
            children: <InventoryQuery inventory={inventory} locale={locale} />,
          },
          {
            key: 'saved',
            label: l('保存查询', 'Saved queries'),
            children: <SavedQueries inventory={inventory} locale={locale} canWrite={canRead} />,
          },
          {
            key: 'fields',
            label: l('字段目录', 'Field catalog'),
            children: (
              <FieldCatalog
                inventory={inventory}
                locale={locale}
                canWrite={fieldsWrite}
                canReadReferences={fieldsWrite && resourceRead}
              />
            ),
          },
          {
            key: 'layout',
            label: l('展示布局', 'Display layout'),
            children: <FieldLayout inventory={inventory} locale={locale} canWrite={fieldsWrite} />,
          },
          {
            key: 'mappings',
            label: l('采集映射', 'Collection mappings'),
            children: (
              <CollectionMappings
                mappings={mappings}
                content={content}
                locale={locale}
                canWrite={resourceWrite}
              />
            ),
          },
        ]}
      />
    </>
  )
}
