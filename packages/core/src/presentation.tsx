import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import { ConfigProvider, theme, type ThemeConfig } from 'antd'
import { StyleProvider } from '@ant-design/cssinjs'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'

export type Locale = 'zh-CN' | 'en-US'
export type Theme = 'light' | 'dark'
const Context = createContext<{
  locale: Locale
  setLocale: (value: Locale) => void
  theme: Theme
  setTheme: (value: Theme) => void
} | null>(null)

export function rssTheme(dark: boolean, build = false): ThemeConfig {
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    hashed: false,
    cssVar: { key: dark ? 'rss-dark' : 'rss-light' },
    zeroRuntime: !build,
    token: {
      colorPrimary: dark ? '#9aaff0' : '#4268bf',
      borderRadius: 6,
      fontSize: 14,
      colorBgContainer: dark ? '#22242a' : '#fff',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif',
    },
  }
}

/** Each application owns this presentation lifetime; no authentication or product state. */
export function Presentation({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() =>
    localStorage.getItem('rss-locale') === 'en-US' ? 'en-US' : 'zh-CN',
  )
  const [selectedTheme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('rss-theme')
    return stored === 'light' || stored === 'dark'
      ? stored
      : window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  })
  const [styleContainer] = useState(() => document.createElement('div'))
  useEffect(() => {
    document.documentElement.lang = locale
    localStorage.setItem('rss-locale', locale)
  }, [locale])
  useLayoutEffect(() => {
    document.documentElement.dataset['theme'] = selectedTheme
  }, [selectedTheme])
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const follow = (event: MediaQueryListEvent) => {
      if (!localStorage.getItem('rss-theme')) setTheme(event.matches ? 'dark' : 'light')
    }
    media?.addEventListener('change', follow)
    return () => media?.removeEventListener('change', follow)
  }, [])
  return (
    <Context.Provider
      value={{
        locale,
        setLocale,
        theme: selectedTheme,
        setTheme: (value) => {
          localStorage.setItem('rss-theme', value)
          setTheme(value)
        },
      }}
    >
      <StyleProvider container={styleContainer}>
        <ConfigProvider
          locale={locale === 'zh-CN' ? zhCN : enUS}
          theme={rssTheme(selectedTheme === 'dark')}
          button={{ autoInsertSpace: false }}
        >
          {children}
        </ConfigProvider>
      </StyleProvider>
    </Context.Provider>
  )
}
export function usePresentation() {
  const value = useContext(Context)
  if (!value) throw new Error('Presentation required')
  return value
}
