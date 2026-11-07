import { Typography } from 'antd'
import { Link, useLocation } from 'react-router-dom'
import type { DiagnosticsContext } from '@rss/mdm-audit'
import type { Locale } from './i18n'
import { diagnosticsPath, type DiagnosticSelection } from './diagnostic-context'

export function DiagnosticReference({
  locale,
  selection,
  context,
}: {
  locale: Locale
  selection: DiagnosticSelection
  context?: DiagnosticsContext | undefined
}) {
  const { pathname } = useLocation()
  const destination = context ?? (pathname.startsWith('/platform/') ? 'management' : 'mdm')
  const id =
    selection.mode === 'request'
      ? selection.id
      : selection.mode === 'operation'
        ? selection.address.operationId
        : null
  const label =
    selection.mode === 'request'
      ? locale === 'zh'
        ? 'HTTP 请求编号'
        : 'HTTP request ID'
      : locale === 'zh'
        ? '原操作编号'
        : 'Original operation ID'
  return (
    <span>
      {id && (
        <>
          {label}{' '}
          <Typography.Text
            code
            copyable={{
              text: id,
              tooltips: locale === 'zh' ? ['复制编号', '已复制'] : ['Copy ID', 'Copied'],
            }}
          >
            {id}
          </Typography.Text>
          {' · '}
        </>
      )}
      <Link to={diagnosticsPath(destination, selection)}>
        {locale === 'zh' ? '查看操作排障' : 'Open operation diagnostics'}
      </Link>
    </span>
  )
}
