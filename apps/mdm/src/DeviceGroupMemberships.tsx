import { useState } from 'react'
import { Alert, Button, Card, Collapse, Empty, Form, InputNumber, Tag } from 'antd'
import { Link } from 'react-router-dom'
import type { ViewEndpoint, WindowQuery } from '@rss/mdm-devices'
import { codeOf, CursorControls, labels, ReadState, usePageRead } from './AdminUi'
import { DataTable } from './DataTable'
import { deviceName, timestamp } from './DevicePresentation'
import { groupDetailPath, groupKindLabel } from './Groups'
import type { GroupsUseCases } from './GroupPicker'
import type { Locale } from './i18n'

type MembershipProps = {
  locale: Locale
  groups: GroupsUseCases
  binding: string
}

function EndpointMemberships({
  locale,
  groups,
  binding,
  endpoint,
  limit,
}: MembershipProps & { endpoint: ViewEndpoint; limit: number }) {
  const l = labels(locale),
    name = deviceName(endpoint.displayName, ''),
    title = name ? `${name} · ${endpoint.id}` : endpoint.id,
    [cursor, setCursor] = useState<string>(),
    query: WindowQuery = { cursor, limit },
    read = usePageRead(JSON.stringify([binding, 'device-groups', endpoint.id, query]), (signal) =>
      groups.memberships(endpoint.id, query, signal),
    ),
    error = read.error,
    pageConflict =
      cursor &&
      error instanceof Error &&
      error.cause === 'wire' &&
      'status' in error &&
      error.status === 409 &&
      codeOf(error) === 'operation_conflict',
    first = () => setCursor(undefined)
  return (
    <section aria-label={title}>
      <Card size="small" title={title}>
        <ReadState
          locale={locale}
          busy={read.busy}
          error={error}
          onRetry={read.reload}
          onRestart={first}
        />
        {pageConflict && <Button onClick={first}>{l('返回首页', 'First page')}</Button>}
        {read.value && (
          <>
            {!read.value.associationCurrent && (
              <Alert
                type="warning"
                title={l('关联依据待更新。', 'Association basis pending update.')}
              />
            )}
            {read.value.items.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={l(
                  '此页没有已发布的组归属。',
                  'No published group memberships on this page.',
                )}
              />
            ) : (
              <DataTable
                locale={locale}
                dataSource={read.value.items}
                rowKey="id"
                columns={[
                  {
                    title: l('设备组', 'Device group'),
                    render: (_, row) => (
                      <Link to={groupDetailPath(row.id)}>
                        {typeof row.presentation['name'] === 'string'
                          ? row.presentation['name']
                          : row.id}
                      </Link>
                    ),
                  },
                  {
                    title: l('类型', 'Type'),
                    render: (_, row) => groupKindLabel(locale, row.kind),
                  },
                  {
                    title: l('成员依据更新时间', 'Membership basis updated'),
                    render: (_, row) => timestamp(locale, row.asOf),
                  },
                  {
                    title: l('状态', 'Status'),
                    render: (_, row) =>
                      row.evaluation === 'current' ? (
                        <Tag color="success">{l('当前', 'Current')}</Tag>
                      ) : (
                        <Tag color="warning">{l('待更新', 'Pending update')}</Tag>
                      ),
                  },
                  {
                    title: l('实际成员对象', 'Member objects'),
                    render: (_, row) => (
                      <ul>
                        {row.objects.map((object) => (
                          <li key={`${object.kind}/${object.id}`}>
                            {object.kind === 'endpoint'
                              ? l('终端', 'Endpoint')
                              : l('关联设备', 'Associated device')}{' '}
                            <code>{object.id}</code>
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                ]}
              />
            )}
            <CursorControls
              locale={locale}
              query={query}
              next={read.value.nextCursor}
              count={read.value.items.length}
              onChange={(next) => setCursor(next.cursor)}
            />
          </>
        )}
      </Card>
    </section>
  )
}

function MembershipPages({
  endpoints,
  ...props
}: MembershipProps & { endpoints: readonly ViewEndpoint[] }) {
  const l = labels(props.locale),
    [limit, setLimit] = useState(100),
    size = l('所属组每页条目', 'Group memberships per page')
  return (
    <div className="device-group-membership-pages">
      <Form.Item label={size}>
        <InputNumber
          aria-label={size}
          value={limit}
          min={1}
          max={1000}
          precision={0}
          onChange={(value) => {
            if (value && value >= 1 && value <= 1000) setLimit(value)
          }}
        />
      </Form.Item>
      {endpoints.map((endpoint) => (
        <EndpointMemberships
          {...props}
          key={`${endpoint.id}/${limit}`}
          endpoint={endpoint}
          limit={limit}
        />
      ))}
    </div>
  )
}

export function DeviceGroupMemberships({
  authorityKey,
  ...props
}: MembershipProps & { endpoints: readonly ViewEndpoint[]; authorityKey: string }) {
  const l = labels(props.locale),
    [open, setOpen] = useState(false)
  return (
    <Collapse
      className="device-group-memberships"
      activeKey={open ? ['groups'] : []}
      onChange={(keys) => setOpen(keys.includes('groups'))}
      items={[
        {
          key: 'groups',
          label: l('所属组', 'Group memberships'),
          children: open ? (
            <MembershipPages key={`${props.binding}/${authorityKey}`} {...props} />
          ) : null,
        },
      ]}
    />
  )
}
