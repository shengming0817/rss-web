import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function PageLoading({ children }: { children: ReactNode }) {
  return createPortal(<div data-rss-page-loading="">{children}</div>, document.body)
}
