import { useEffect, useState } from 'react'
import { Alert, Button, Card } from 'antd'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Heading, labels, ReadState, useRead } from './AdminUi'
import { DataTable } from './DataTable'
export function PublicDownloads({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    read = useRead(`public-packages/${runtime.host.tenant}`, runtime.onboarding.packages)
  return (
    <section className="public-enrollment">
      <Heading
        title={l('Agent 安装包', 'Agent installers')}
        hint={l(
          '固定安装包无需登录；安装后的注册使用管理员交付的 JSON 文件。',
          'Fixed installers need no login. Enrollment after installation uses an administrator-issued JSON file.',
        )}
      />
      <Alert
        type="info"
        title={l(
          '暂停新注册不停止公开下载，也不代表安装后的注册一定可用。',
          'Pausing new enrollment does not stop downloads. Download availability does not establish enrollment readiness.',
        )}
      />
      <Button onClick={read.reload}>{l('重新读取安装包', 'Read installers again')}</Button>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {read.value && (
        <DataTable
          locale={locale}
          rowKey="releaseId"
          dataSource={read.value}
          columns={[
            {
              title: l('平台', 'Platform'),
              render: (_, row) => `${row.target.platform} / ${row.target.architecture}`,
            },
            { title: l('版本', 'Version'), dataIndex: 'version' },
            { title: l('安装包', 'Installer'), dataIndex: 'filename' },
            { title: l('大小（字节）', 'Size (bytes)'), dataIndex: 'length' },
            {
              title: l('下载', 'Download'),
              render: (_, row) => (
                <a href={runtime.onboarding.packageUrl(row.releaseId)} download={row.filename}>
                  {l('下载安装包', 'Download installer')}
                </a>
              ),
            },
          ]}
        />
      )}
    </section>
  )
}
export function EntraTerms({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    read = useRead('public-entra-terms', runtime.onboarding.terms),
    [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const expired = !read.value || read.value.expiresAt * 1000 <= now
  return (
    <section className="public-enrollment">
      <Heading title={l('Windows 注册条款', 'Windows enrollment terms')} />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {read.value && (
        <Card>
          <p className="subtitle">{read.value.termsVersion}</p>
          <p className="enrollment-terms">{read.value.termsText}</p>
          {expired && (
            <Alert
              type="warning"
              title={l(
                '条款会话已到期，请从系统注册入口重新开始。',
                'The terms session expired. Restart from the native enrollment flow.',
              )}
            />
          )}
          <form action={runtime.onboarding.termsFinishUrl()} method="post">
            <input type="hidden" name="csrfToken" value={read.value.csrfToken} />
            <Button
              htmlType="submit"
              name="accepted"
              value="true"
              type="primary"
              disabled={expired}
            >
              {l('接受并继续', 'Accept and continue')}
            </Button>
            {read.value.canDecline && (
              <Button htmlType="submit" name="accepted" value="false" disabled={expired}>
                {l('拒绝', 'Decline')}
              </Button>
            )}
          </form>
        </Card>
      )}
    </section>
  )
}
