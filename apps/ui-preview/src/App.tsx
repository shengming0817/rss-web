import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Progress,
  Radio,
  Select,
  Skeleton,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
} from 'antd'
import { QueryRows, usePresentation } from '@rss/core'

export function App() {
  const { locale, setLocale, theme, setTheme } = usePresentation()
  const t = (zh: string, en: string) => (locale === 'zh-CN' ? zh : en)
  const [disabled, setDisabled] = useState(false),
    [readOnly, setReadOnly] = useState(false)
  const [invalid, setInvalid] = useState(false),
    [busy, setBusy] = useState(false),
    [empty, setEmpty] = useState(false)
  const [name, setName] = useState('RSS'),
    [choice, setChoice] = useState('first')
  const [dialog, setDialog] = useState(false),
    [nested, setNested] = useState(false),
    [feedback, setFeedback] = useState(false)
  const options = [
    { value: 'first', label: t('第一项', 'First') },
    { value: 'second', label: t('第二项', 'Second') },
  ]
  return (
    <div className="preview" data-preview="rss-ui-preview-only">
      <header className="preview-header">
        <div>
          <p>RSS UI Components · Ant Design</p>
          <h1>{t('组件展示', 'Component gallery')}</h1>
          <p>{t('独立展示，不加载产品接口', 'Independent preview without product APIs')}</p>
        </div>
        <Space>
          <Button onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}>
            {t('English', '中文')}
          </Button>
          <Button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {t('切换主题', 'Toggle theme')}
          </Button>
        </Space>
      </header>
      <Card title={t('交互状态', 'Interaction states')}>
        <Space wrap>
          <Checkbox checked={disabled} onChange={(e) => setDisabled(e.target.checked)}>
            {t('禁用', 'Disabled')}
          </Checkbox>
          <Checkbox checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)}>
            {t('只读', 'Read only')}
          </Checkbox>
          <Checkbox checked={invalid} onChange={(e) => setInvalid(e.target.checked)}>
            {t('校验错误', 'Invalid')}
          </Checkbox>
          <Checkbox checked={busy} onChange={(e) => setBusy(e.target.checked)}>
            {t('加载中', 'Busy')}
          </Checkbox>
          <Checkbox checked={empty} onChange={(e) => setEmpty(e.target.checked)}>
            {t('空数据', 'Empty')}
          </Checkbox>
        </Space>
      </Card>
      <main className="preview-grid">
        <Card title={t('按钮与反馈', 'Actions and feedback')}>
          <Space orientation="vertical">
            <Space>
              <Button
                type="primary"
                loading={busy}
                disabled={disabled}
                onClick={() => setFeedback(true)}
              >
                {t('主要操作', 'Primary action')}
              </Button>
              <Button disabled={disabled} onClick={() => setFeedback(true)}>
                {t('次要操作', 'Secondary action')}
              </Button>
              <Button danger disabled={disabled} onClick={() => setFeedback(true)}>
                {t('危险操作', 'Destructive action')}
              </Button>
            </Space>
            <Space>
              <Tag color="success">{t('成功', 'Success')}</Tag>
              <Tag color="warning">{t('注意', 'Warning')}</Tag>
              <Tag>{t('未知', 'Unknown')}</Tag>
            </Space>
            <Alert type="info" title={t('状态来自消费页面', 'The consuming page owns state')} />
            <Alert
              type="error"
              title={t('请求失败，请明确重试', 'Request failed; retry explicitly')}
            />
            <Alert type="warning" title={t('没有执行权限', 'Permission denied')} />
            <Progress percent={60} status={busy ? 'active' : 'normal'} />
            {busy && <Skeleton active />}
            {feedback && (
              <Alert
                closable
                onClose={() => setFeedback(false)}
                type="success"
                title={t('操作反馈', 'Action feedback')}
              />
            )}
          </Space>
        </Card>
        <Card title={t('表单与选择', 'Forms and selection')}>
          <Space orientation="vertical">
            <label htmlFor="preview-name">{t('名称', 'Name')}</label>
            <Input
              id="preview-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={disabled}
              readOnly={readOnly}
              status={invalid ? 'error' : ''}
            />
            {invalid && <p role="alert">{t('请输入有效名称', 'Enter a valid name')}</p>}
            <Input.TextArea
              aria-label={t('备注', 'Notes')}
              disabled={disabled}
              readOnly={readOnly}
            />
            <InputNumber
              aria-label={t('数量', 'Quantity')}
              defaultValue={3}
              disabled={disabled}
              readOnly={readOnly}
            />
            <Input
              type="date"
              aria-label={t('日期', 'Date')}
              disabled={disabled}
              readOnly={readOnly}
            />
            <Switch
              aria-label={t('启用', 'Enabled')}
              disabled={disabled || readOnly}
              defaultChecked
            />
            <Radio.Group
              value={choice}
              onChange={(e) => setChoice(String(e.target.value))}
              options={options}
              disabled={disabled || readOnly}
            />
            <Select
              aria-label={t('搜索项目', 'Search items')}
              value={choice}
              onChange={setChoice}
              showSearch
              options={empty ? [] : options}
              disabled={disabled || readOnly}
              loading={busy}
            />
          </Space>
        </Card>
        <Card title={t('导航与弹层', 'Navigation and overlays')}>
          <Space orientation="vertical">
            <Tabs
              items={options.map((option) => ({
                key: option.value,
                label: option.label,
                children: option.label,
              }))}
            />
            <Collapse
              items={[
                {
                  key: 'details',
                  label: t('展开详情', 'Expand details'),
                  children: t('详情内容', 'Details'),
                },
              ]}
            />
            <Space>
              <Dropdown
                menu={{
                  items: options.map((option) => ({ key: option.value, label: option.label })),
                  onClick: () => setFeedback(true),
                }}
              >
                <Button>{t('菜单', 'Menu')}</Button>
              </Dropdown>
              <Tooltip
                title={t('键盘焦点也可显示提示', 'Also available on keyboard focus')}
                trigger={['hover', 'focus']}
              >
                <Button>{t('提示', 'Tooltip')}</Button>
              </Tooltip>
              <Button onClick={() => setDialog(true)}>{t('打开对话框', 'Open dialog')}</Button>
            </Space>
          </Space>
        </Card>
        <Card title={t('表格与分页', 'Tables and pagination')}>
          {empty ? (
            <Empty />
          ) : (
            <QueryRows
              items={[
                { id: 'windows', name: 'Windows', state: t('已观察', 'Observed') },
                { id: 'macos', name: 'macOS', state: t('未知', 'Unknown') },
              ]}
              disabled={disabled}
              onOpen={() => setDialog(true)}
            />
          )}
          <Pagination defaultCurrent={1} total={30} pageSize={10} disabled={disabled} />
        </Card>
      </main>
      <Modal
        open={dialog}
        title={t('对话框', 'Dialog')}
        onCancel={() => {
          setDialog(false)
          setNested(false)
        }}
        onOk={() => {
          setDialog(false)
          setFeedback(true)
        }}
        destroyOnHidden
      >
        <label htmlFor="preview-dialog-name">{t('名称', 'Name')}</label>
        <Input id="preview-dialog-name" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={choice} onChange={setChoice} options={options} />
        <Button onClick={() => setNested(true)}>{t('打开嵌套对话框', 'Open nested dialog')}</Button>
        <Modal
          open={nested}
          title={t('嵌套对话框', 'Nested dialog')}
          onCancel={() => setNested(false)}
          onOk={() => setNested(false)}
          destroyOnHidden
        >
          <Input aria-label={t('嵌套输入', 'Nested input')} />
        </Modal>
      </Modal>
    </div>
  )
}
