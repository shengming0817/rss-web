import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Select } from 'antd'
import { Link } from 'react-router-dom'
import type { ResultKind } from '@rss/mdm-groups'
import type { GroupsUseCases } from './GroupPicker'
import type { Locale } from './i18n'
import { CursorControls, firstPage, labels, ReadState, useRead, type Query } from './AdminUi'
import { DataTable } from './DataTable'
import { CollectionPlan } from './CollectionMappingEditor'
import { Status } from './DevicePresentation'
import { devicePath } from './Devices'

export function GroupResults({
  groups,
  locale,
  id,
  result,
  preview = false,
}: {
  groups: GroupsUseCases
  locale: Locale
  id: string
  result: string
  preview?: boolean
}) {
  const l = labels(locale),
    [kind, setKind] = useState<ResultKind>('members'),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(`group-result/${id}/${result}/${kind}/${JSON.stringify(query)}`, () =>
      groups.result(id, result, kind, query),
    )
  return (
    <Card
      title={
        preview
          ? l('预览固定结果', 'Fixed preview results')
          : l('成员集固定结果', 'Fixed member set results')
      }
    >
      <p>
        <code>{result}</code>
      </p>
      {preview && (
        <Alert
          type="info"
          title={l(
            '预览使用已保存定义，不发布正式成员，也不包含未保存草稿。',
            'Preview evaluates the saved definition, excludes unsaved edits and does not publish formal members.',
          )}
        />
      )}
      <Select
        aria-label={l('成员集结果页类型', 'Member set result kind')}
        value={kind}
        options={[
          { value: 'members', label: l('成员', 'Members') },
          { value: 'changes', label: l('增减', 'Changes') },
          { value: 'decisions', label: l('判定与证据', 'Decisions and evidence') },
        ]}
        onChange={(kind: ResultKind) => {
          setKind(kind)
          setQuery(firstPage(query))
        }}
      />
      <Button onClick={read.reload}>
        {l('读取固定成员集结果', 'Read fixed member set result')}
      </Button>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <Alert
            type={read.value.current ? 'success' : 'warning'}
            title={
              read.value.current
                ? l(
                    '此成员集与服务端当前来源一致。',
                    'This member set matches current server inputs.',
                  )
                : preview
                  ? l(
                      '预览结果不会成为正式当前成员。',
                      'Preview results do not become current formal membership.',
                    )
                  : l(
                      '此结果不是当前成员集或来源已变化；保留为历史证据。',
                      'This result is historical or its inputs changed; it is not current membership.',
                    )
            }
          />
          <dl className="device-facts">
            <div>
              <dt>{l('判定对象总数', 'Total evaluated objects')}</dt>
              <dd>{read.value.totalObjects}</dd>
            </div>
            <div>
              <dt>{l('成员总数', 'Total members')}</dt>
              <dd>{read.value.totalMembers}</dd>
            </div>
          </dl>
          <details>
            <summary>
              {l('定义 / 成员 / 权威来源坐标', 'Definition / member / authority coordinates')}
            </summary>
            <DataTable
              locale={locale}
              dataSource={read.value.sources}
              rowKey="group"
              columns={[
                { title: l('来源组', 'Source group'), dataIndex: 'group' },
                { title: l('上下文', 'Context'), render: (_, row) => row.coordinates.assetContext },
                {
                  title: l('定义版本', 'Definition version'),
                  render: (_, row) => row.coordinates.definitionVersion,
                },
                {
                  title: l('成员语义版本', 'Member version'),
                  render: (_, row) => row.coordinates.memberVersion,
                },
                {
                  title: l('权威版本', 'Authority version'),
                  render: (_, row) => row.coordinates.authorityVersion,
                },
                {
                  title: l('成员集', 'Member set'),
                  render: (_, row) => row.coordinates.memberSet ?? '—',
                },
              ]}
            />
          </details>
          {read.value.page.kind === 'members' && (
            <DataTable
              locale={locale}
              dataSource={read.value.page.items}
              rowKey={(row) => `${row.kind}/${row.id}`}
              columns={[
                {
                  title: l('成员对象', 'Member object'),
                  render: (_, row) => (
                    <Link to={devicePath(row.kind, row.id)}>
                      {row.kind} · {row.id}
                    </Link>
                  ),
                },
              ]}
            />
          )}
          {read.value.page.kind === 'changes' && (
            <DataTable
              locale={locale}
              dataSource={[
                ...read.value.page.added.map((object) => ({ object, change: 'added' })),
                ...read.value.page.removed.map((object) => ({ object, change: 'removed' })),
              ]}
              rowKey={(row) => `${row.change}/${row.object.kind}/${row.object.id}`}
              columns={[
                {
                  title: l('变化', 'Change'),
                  render: (_, row) =>
                    row.change === 'added' ? l('新增', 'Added') : l('移除', 'Removed'),
                },
                {
                  title: l('对象', 'Object'),
                  render: (_, row) => (
                    <Link to={devicePath(row.object.kind, row.object.id)}>
                      {row.object.kind} · {row.object.id}
                    </Link>
                  ),
                },
              ]}
            />
          )}
          {read.value.page.kind === 'decisions' && (
            <DataTable
              locale={locale}
              dataSource={read.value.page.items}
              rowKey={(row) => `${row.object.kind}/${row.object.id}`}
              columns={[
                {
                  title: l('对象', 'Object'),
                  render: (_, row) => (
                    <Link to={devicePath(row.object.kind, row.object.id)}>
                      {row.object.kind} · {row.object.id}
                    </Link>
                  ),
                },
                {
                  title: l('判定', 'Decision'),
                  render: (_, row) => (
                    <>
                      <Status locale={locale} value={row.decision} /> · {row.origin}
                    </>
                  ),
                },
                {
                  title: l('判定与来源证据', 'Decision and source evidence'),
                  render: (_, row) => (
                    <details>
                      <summary>
                        {l(
                          '查看条件路径及注册代次',
                          'Read condition paths and registration generations',
                        )}
                      </summary>
                      <CollectionPlan
                        value={{
                          explanations: row.explanations,
                          provenance: row.provenance,
                          sourceObjects: row.sourceObjects,
                        }}
                      />
                    </details>
                  ),
                },
              ]}
            />
          )}
          <CursorControls
            locale={locale}
            next={read.value.nextCursor}
            count={
              read.value.page.kind === 'changes'
                ? read.value.page.added.length + read.value.page.removed.length
                : read.value.page.items.length
            }
            query={query}
            onChange={setQuery}
          />
        </>
      )}
      {!!read.error && query.cursor && (
        <Button onClick={() => setQuery(firstPage(query))}>
          {l('成员集游标失效，返回首页', 'Member set cursor expired; first page')}
        </Button>
      )}
    </Card>
  )
}
export function GroupTaskPanel({
  groups,
  locale,
  id,
  initialTask = '',
}: {
  groups: GroupsUseCases
  locale: Locale
  id: string
  initialTask?: string
}) {
  const l = labels(locale),
    [draft, setDraft] = useState(initialTask),
    [task, setTask] = useState(initialTask),
    [result, setResult] = useState<{ id: string; preview: boolean } | null>(null),
    read = useRead(`group-task/${id}/${task}`, () =>
      task ? groups.task(id, task) : Promise.resolve(null),
    )
  return (
    <Card title={l('设备组任务', 'Device group task')}>
      <Form
        layout="inline"
        onFinish={() => {
          setTask(draft)
          setResult(null)
          read.reload()
        }}
      >
        <Form.Item label={l('原设备组任务标识', 'Original group task ID')}>
          <Input
            aria-label={l('原设备组任务标识', 'Original group task ID')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">{l('读取任务进度', 'Read task progress')}</Button>
      </Form>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <p>
            <Status locale={locale} value={read.value.status} /> · {read.value.kind} ·{' '}
            {read.value.failure ?? read.value.failureDetail?.reason ?? '—'}
          </p>
          <dl className="device-facts">
            <div>
              <dt>{l('已处理对象', 'Processed objects')}</dt>
              <dd>{read.value.processed}</dd>
            </div>
            <div>
              <dt>{l('已计算成员', 'Computed members')}</dt>
              <dd>{read.value.members}</dd>
            </div>
          </dl>
          {read.value.kind === 'group_definition' ? (
            <Alert
              type="info"
              title={l(
                '这是定义验证任务。完成后重新读取组定义与正式成员集，不把原成员集作为新规则结果。',
                'This task validates a definition. Read the group and formal member set after completion; prior membership is not the new rule’s result.',
              )}
            />
          ) : (
            read.value.status === 'completed' && (
              <Button
                onClick={() => {
                  if (read.value)
                    setResult({ id: read.value.task, preview: read.value.kind === 'group_preview' })
                }}
              >
                {l('读取此任务固定结果', 'Read this task’s fixed result')}
              </Button>
            )
          )}
          {read.value.replacementTask && (
            <Button
              onClick={() => {
                const replacement = read.value?.replacementTask
                if (replacement) {
                  setTask(replacement)
                  setDraft(replacement)
                  setResult(null)
                }
              }}
            >
              {l('读取服务端替代任务', 'Read server replacement task')}
            </Button>
          )}
        </>
      )}
      {result && (
        <GroupResults
          key={result.id}
          groups={groups}
          locale={locale}
          id={id}
          result={result.id}
          preview={result.preview}
        />
      )}
    </Card>
  )
}
