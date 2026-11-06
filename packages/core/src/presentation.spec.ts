import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { Presentation, rssTheme, usePresentation } from './presentation'
import { QueryControls, type QueryControlsProps } from './components/QueryControls'
import { QueryRows } from './components/QueryRows'

let root: Root | undefined
let host: HTMLDivElement
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
function mount(node: React.ReactNode) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(h(Presentation, null, node)))
}
function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((node) => node.textContent === text)
  expect(button).toBeTruthy()
  act(() => button!.click())
}
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  localStorage.clear()
  delete document.documentElement.dataset['theme']
  vi.restoreAllMocks()
})
it('shares explicit theme and locale preferences without writing styles into the document', () => {
  function Controls() {
    const { locale, setLocale, theme, setTheme } = usePresentation()
    return h(
      'div',
      null,
      h('output', null, `${locale}/${theme}`),
      h('button', { onClick: () => setLocale('en-US') }, 'language'),
      h('button', { onClick: () => setTheme('dark') }, 'theme'),
    )
  }
  mount(h(Controls))
  expect(host.querySelector('output')?.textContent).toBe('zh-CN/light')
  click('language')
  click('theme')
  expect(document.documentElement.lang).toBe('en-US')
  expect(document.documentElement.dataset['theme']).toBe('dark')
  expect(localStorage.getItem('rss-theme')).toBe('dark')
  expect(localStorage.getItem('rss-locale')).toBe('en-US')
  expect(host.querySelector('style')).toBeNull()
  expect(rssTheme(false, true).zeroRuntime).toBe(false)
  expect(rssTheme(true).zeroRuntime).toBe(true)
})
it('follows the system theme until the user explicitly chooses one and releases its listener', () => {
  let onChange: ((event: MediaQueryListEvent) => void) | undefined
  const remove = vi.fn()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: (_event: string, fn: typeof onChange) => {
        onChange = fn
      },
      removeEventListener: remove,
    })),
  )
  localStorage.setItem('rss-locale', 'en-US')
  mount(h('p', null, 'system'))
  expect(document.documentElement.dataset['theme']).toBe('dark')
  act(() => onChange!({ matches: false } as MediaQueryListEvent))
  expect(document.documentElement.dataset['theme']).toBe('light')
  localStorage.setItem('rss-theme', 'dark')
  act(() => onChange!({ matches: false } as MediaQueryListEvent))
  act(() => root!.unmount())
  root = undefined
  expect(remove).toHaveBeenCalled()
  vi.unstubAllGlobals()
})
it('presents sparse rows and permits details only with complete required coordinates', () => {
  const open = vi.fn()
  mount(
    h(QueryRows, {
      items: [{ id: 'one', value: null }, { id: null, other: { nested: true } }, { value: false }],
      onOpen: open,
    }),
  )
  expect(host.textContent).toContain('完整详情')
  expect(host.textContent).toContain('{"nested":true}')
  expect(host.textContent).toContain('—')
  click('读取详情')
  expect(open).toHaveBeenCalledExactlyOnceWith({ id: 'one', value: null })
  act(() =>
    root!.render(
      h(Presentation, null, h(QueryRows, { items: [{ id: 'one' }], onOpen: open, disabled: true })),
    ),
  )
  expect(host.querySelector('button')?.disabled).toBe(true)
})
it('keeps query application explicit and prevents invalid or disabled submissions', () => {
  const props: QueryControlsProps = {
    filter: '',
    sort: '',
    fields: ['id'],
    columns: ['id', 'name'],
    limit: 50,
    maximum: 100,
    labels: {
      filter: 'Filter',
      sort: 'Sort',
      fields: 'Fields',
      limit: 'Limit',
      apply: 'Apply',
      first: 'First',
      previous: 'Previous',
      next: 'Next',
    },
    onFilter: vi.fn(),
    onSort: vi.fn(),
    onFields: vi.fn(),
    onLimit: vi.fn(),
    onApply: vi.fn(),
    onFirst: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
  }
  mount(h(QueryControls, props))
  const change = (suffix: string, value: string) => {
    const input = host.querySelector<HTMLInputElement>(`input[id$="-${suffix}"]`)!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  change('filter', 'name==example')
  change('sort', '-id')
  change('limit', '42')
  expect(props.onFilter).toHaveBeenCalledWith('name==example')
  expect(props.onSort).toHaveBeenCalledWith('-id')
  expect(props.onLimit).toHaveBeenCalledWith(42)
  click('Apply')
  click('First')
  expect(props.onApply).toHaveBeenCalledTimes(1)
  expect(props.onFirst).toHaveBeenCalledTimes(1)
  expect([...host.querySelectorAll('button')].find((b) => b.textContent === 'Next')?.disabled).toBe(
    true,
  )
  act(() =>
    root!.render(h(Presentation, null, h(QueryControls, { ...props, fields: [], limit: 0 }))),
  )
  click('Apply')
  expect(props.onApply).toHaveBeenCalledTimes(1)
})
