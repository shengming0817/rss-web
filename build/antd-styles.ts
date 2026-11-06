import { createElement } from 'react'
import { ConfigProvider } from 'antd'
import { extractStyle } from '@ant-design/static-style-extract'
import { rssTheme } from '../packages/core/src/presentation'

/** Same external CSS and zero-runtime theme contract as the production MDM. */
export function antdStyles() {
  const id = '\0virtual:rss-theme.css'
  return {
    name: 'rss-static-theme',
    resolveId(source: string) {
      if (source === 'virtual:rss-theme.css') return id
    },
    load(source: string) {
      if (source === id)
        return [false, true]
          .map((dark) =>
            extractStyle({
              customTheme: (node) =>
                createElement(ConfigProvider, { theme: rssTheme(dark, true) }, node),
            }),
          )
          .join('\n')
    },
  }
}
