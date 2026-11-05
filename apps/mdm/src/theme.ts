import { theme } from 'antd'
import type { ThemeConfig } from 'antd'

/** Both themes are compiled once; runtime token styles stay in the detached style cache. */
export function mdmTheme(dark: boolean, build = false): ThemeConfig {
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    hashed: false,
    cssVar: { key: dark ? 'mdm-dark' : 'mdm-light' },
    zeroRuntime: !build,
    token: {
      colorPrimary: dark ? '#e3e3e8' : '#252629',
      colorTextLightSolid: dark ? '#1e1f23' : '#fff',
      colorBgContainer: dark ? '#1b1c1f' : '#fff',
      colorText: dark ? '#eeeef1' : '#202124',
      colorInfo: '#5374c6',
      colorSuccess: '#218262',
      colorWarning: '#a96c16',
      colorError: '#cc5356',
      borderRadius: 6,
      fontSize: 13,
      colorBorder: dark ? '#303136' : '#e9e9ec',
      fontFamily: 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif',
    },
  }
}
