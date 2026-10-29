import { createContext, useContext, useEffect, useState } from 'react'
import { Alert, Tabs, type TabsProps } from 'antd'
import type { ReactNode } from 'react'
import type { Locale } from './i18n'
import { labels } from './AdminUi'

const SecretVisibility = createContext(true)
function Visibility({ active, children }: { active: boolean; children: ReactNode }) {
  const parent = useContext(SecretVisibility)
  return <SecretVisibility.Provider value={parent && active}>{children}</SecretVisibility.Provider>
}
export function useSecretVisibility(): boolean {
  return useContext(SecretVisibility)
}
/** Retain entered operation owners, but use only current authority for visibility and controls. */
export function SecretTabs({
  items = [],
  activeKey,
  defaultActiveKey,
  onChange,
  authorizedKeys,
  uiLocale = 'zh',
  ...props
}: TabsProps & { authorizedKeys?: readonly string[]; uiLocale?: Locale }) {
  const l = labels(uiLocale),
    [selected, setSelected] = useState(defaultActiveKey),
    [retained, setRetained] = useState<readonly string[]>([]),
    permitted = (key: string) => authorizedKeys === undefined || authorizedKeys.includes(key),
    shown = items.filter((item) => permitted(item.key) || retained.includes(item.key)),
    requested = activeKey ?? selected,
    active = shown.some((item) => item.key === requested) ? requested : shown[0]?.key
  useEffect(() => {
    const entered = items.filter((item) => permitted(item.key)).map((item) => item.key)
    if (entered.some((key) => !retained.includes(key)))
      setRetained([...new Set([...retained, ...entered])])
  }, [items, authorizedKeys, retained])
  return (
    <Tabs
      {...props}
      activeKey={active ?? ''}
      onChange={(key) => {
        setSelected(key)
        onChange?.(key)
      }}
      items={shown.map((item) => {
        const allowed = permitted(item.key)
        return {
          ...item,
          children: (
            <Visibility active={item.key === active && allowed}>
              {!allowed && (
                <Alert
                  type="info"
                  title={l(
                    '当前面板权限尚未确认。重新读取权限后继续原操作。',
                    'Panel permissions are unconfirmed. Read permissions again to continue the original operation.',
                  )}
                />
              )}
              <fieldset className="permission-panel" hidden={!allowed} disabled={!allowed}>
                {item.children}
              </fieldset>
            </Visibility>
          ),
        }
      })}
    />
  )
}
