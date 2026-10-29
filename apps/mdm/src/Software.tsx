import { useState } from 'react'
import { Alert, Button } from 'antd'
import { Heading, labels, ReadState, useRead } from './AdminUi'
import { ResourceDirectory } from './Resources'
import { SoftwareSources } from './SoftwareSources'
import { SoftwareImport } from './SoftwareImport'
import { SoftwareAdmission } from './SoftwareAdmission'
import { SoftwarePublications } from './SoftwarePublications'
import { SecretTabs } from './SecretTabs'
import { useAdministration } from './useAdministration'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'

export function Software({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { resources, content, software, publications, authorization, binding } =
      useAdministration(runtime),
    permissions = useRead(`${binding}/software-presentation`, authorization.effective),
    [tab, setTab] = useState('catalog'),
    has = (operation: string) =>
      permissions.value?.grants.some(
        (grant) => grant.scope.kind === 'tenant' && grant.operation === operation,
      ) ?? false,
    resourceRead = has('resource_read'),
    resourceWrite = has('resource_write'),
    softwareRead = has('software_read'),
    softwareWrite = has('software_write'),
    softwareWithdraw = has('software_withdraw'),
    releaseRead = has('release_read'),
    authorized = [
      ...(resourceRead ? ['catalog'] : []),
      ...(softwareRead || softwareWrite ? ['sources'] : []),
      ...(softwareRead && softwareWrite && resourceWrite ? ['imports'] : []),
      ...(softwareRead ? ['admission'] : []),
      ...(releaseRead ? ['publications'] : []),
    ]
  return (
    <>
      <Heading
        title={l('软件目录', 'Software catalog')}
        hint={l(
          '管理组织软件的精确资源版本、材料与来源。',
          'Manage exact Resource versions, materials and sources for organization software.',
        )}
        actions={
          <Button disabled={!softwareRead && !softwareWrite} onClick={() => setTab('sources')}>
            {l('软件来源', 'Software sources')}
          </Button>
        }
      />
      <Button onClick={permissions.reload}>
        {l('读取软件入口权限', 'Read software entry permissions')}
      </Button>
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      {permissions.value && authorized.length === 0 && (
        <Alert
          type="info"
          title={l(
            '当前权限未开放软件目录、来源、准入或源发布入口。',
            'Your current permissions do not enable software catalog, source, admission or publication access.',
          )}
        />
      )}
      <SecretTabs
        uiLocale={locale}
        activeKey={tab}
        onChange={setTab}
        authorizedKeys={authorized}
        items={[
          {
            key: 'catalog',
            label: l('组织软件', 'Organization software'),
            children: (
              <ResourceDirectory
                resources={resources}
                content={content}
                locale={locale}
                canWrite={resourceWrite}
                canReadSoftware={softwareRead}
                fixedKind="software"
              />
            ),
          },
          {
            key: 'sources',
            label: l('软件来源', 'Software sources'),
            children: (
              <SoftwareSources
                software={software}
                locale={locale}
                canRead={softwareRead}
                canWrite={softwareWrite}
                canWithdraw={softwareWithdraw}
              />
            ),
          },
          {
            key: 'imports',
            label: l('精确来源导入', 'Exact source import'),
            children: (
              <SoftwareImport
                software={software}
                resources={resources}
                content={content}
                locale={locale}
                canWrite={softwareWrite && resourceWrite}
                canReadResource={resourceRead}
                canReadSoftware={softwareRead}
              />
            ),
          },
          {
            key: 'admission',
            label: l('版本准入', 'Version admission'),
            children: (
              <SoftwareAdmission
                software={software}
                locale={locale}
                canEnable={softwareWrite}
                canWithdraw={softwareWithdraw}
              />
            ),
          },
          {
            key: 'publications',
            label: l('WinGet / Brew 源发布', 'WinGet / Brew publication'),
            children: (
              <SoftwarePublications
                publications={publications}
                resources={resources}
                locale={locale}
                canRead={releaseRead}
                canPublish={has('release_publish')}
                canRecover={has('release_recover')}
                canWithdraw={has('release_withdraw')}
                canReadResource={resourceRead}
              />
            ),
          },
        ]}
      />
    </>
  )
}
