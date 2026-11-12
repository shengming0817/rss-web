// @vitest-environment jsdom
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DirectoryCapabilities, DirectoryQuery } from '@rss/mdm-devices'
import { parseFilter } from '@rss/api/mdm-filter'
import { DirectoryCatalogContext, DirectorySearch } from './DirectorySearch'
import { catalogQuery, writeCatalogQuery } from './directory-location'
let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
const capabilities: DirectoryCapabilities = {
  maximum: 100,
  fields: [
    {
      name: 'name',
      kind: 'Text',
      filter: true,
      sort: true,
      output: true,
      nullable: false,
      operators: ['Eq', 'Ne', 'In', 'Out', 'Icontains'],
      limitation: null,
    },
    {
      name: 'deleted',
      kind: 'Boolean',
      filter: true,
      sort: false,
      output: true,
      nullable: false,
      operators: ['Eq', 'Ne'],
      limitation: null,
    },
  ],
}
function button(text: string) {
  return [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.replace(/\s/g, '') === text.replace(/\s/g, ''),
  )!
}
async function fill(selector: string, value: string) {
  const node = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value',
    )!.set!.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function choose(label: string, value: string) {
  await act(async () =>
    host
      .querySelector(`input[aria-label="${label}"]`)!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
  )
  const option = [
    ...document.querySelectorAll<HTMLElement>(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option',
    ),
  ].find((node) => node.textContent === value)!
  expect(option).toBeDefined()
  await act(async () => option.click())
}
async function search(filter: string, onChange: (query: DirectoryQuery) => void) {
  await act(async () =>
    root.render(
      h(
        DirectoryCatalogContext.Provider,
        { value: { groups: capabilities } },
        h(DirectorySearch, { catalog: 'groups', locale: 'zh', query: { filter }, onChange }),
      ),
    ),
  )
  await act(async () => host.querySelector<HTMLElement>('.directory-advanced summary')!.click())
}
it.each([
  ['=in=', '等于', '=='],
  ['=in=', '不等于', '!='],
  ['=out=', '等于', '=='],
  ['=out=', '不等于', '!='],
])(
  'converts %s to %s with one operand and preserves sibling conditions',
  async (from, label, to) => {
    const change = vi.fn()
    await search(`name${from}('a','b');deleted==false`, change)
    await choose('条件操作符', label)
    await act(async () => button('应用').click())
    expect(parseFilter(change.mock.calls[0]![0].filter)).toEqual({
      kind: 'and',
      children: [
        { kind: 'compare', field: 'name', operator: to, values: ['a'] },
        { kind: 'compare', field: 'deleted', operator: '==', values: ['false'] },
      ],
    })
  },
)
it('keeps an empty set editable, rejects its application and round trips the refilled nested draft', async () => {
  const change = vi.fn()
  await search("(name=in=('a'),name=='b');deleted==false", change)
  await act(async () =>
    host
      .querySelector<HTMLElement>('.ant-select-multiple .ant-select-selection-item-remove')!
      .click(),
  )
  expect(host.querySelectorAll('.ant-select-multiple .ant-select-selection-item')).toHaveLength(0)
  await act(async () => button('应用').click())
  expect(change).not.toHaveBeenCalled()
  await act(async () => host.querySelector<HTMLInputElement>('input[value="text"]')!.click())
  expect(host.querySelector<HTMLInputElement>('input[value="text"]')!.disabled).toBe(true)
  expect(host.querySelector('textarea[aria-label="RSQL"]')).toBeNull()
  await fill('.ant-select-multiple input[aria-label="条件值"]', 'next')
  await act(async () =>
    host
      .querySelector('.ant-select-multiple input[aria-label="条件值"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })),
  )
  await act(async () => host.querySelector<HTMLInputElement>('input[value="text"]')!.click())
  const text = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="RSQL"]')!.value
  await act(async () => host.querySelector<HTMLInputElement>('input[value="visual"]')!.click())
  await act(async () => button('应用').click())
  expect(parseFilter(change.mock.calls[0]![0].filter)).toEqual(parseFilter(text))
  expect(parseFilter(text)).toEqual({
    kind: 'and',
    children: [
      {
        kind: 'or',
        children: [
          { kind: 'compare', field: 'name', operator: '=in=', values: ['next'] },
          { kind: 'compare', field: 'name', operator: '==', values: ['b'] },
        ],
      },
      { kind: 'compare', field: 'deleted', operator: '==', values: ['false'] },
    ],
  })
})
it('edits common criteria without dropping nested groups and applies one expression while resetting the cursor', async () => {
  let latest: DirectoryQuery = {
    filter: "(name=='a',name=='b');deleted==false",
    cursor: 'second',
    limit: 10,
  }
  function Search() {
    const [query, setQuery] = useState(latest)
    return h(
      DirectoryCatalogContext.Provider,
      { value: { groups: capabilities } },
      h(DirectorySearch, {
        catalog: 'groups',
        locale: 'zh',
        query,
        onChange: (next) => {
          latest = next
          setQuery(next)
        },
      }),
    )
  }
  await act(async () => root.render(h(Search)))
  await fill('input[aria-label="名称"]', 'literal.*(name)')
  await act(async () => button('应用').click())
  expect(latest.cursor).toBeUndefined()
  expect(parseFilter(latest.filter!).kind).toBe('and')
  expect(latest.filter).toContain("name=='a',name=='b'")
  expect(latest.filter).toContain('literal.*(name)')
})
it('retains invalid RSQL and locates the error without executing the query', async () => {
  const onChange = vi.fn()
  await act(async () =>
    root.render(
      h(
        DirectoryCatalogContext.Provider,
        { value: { groups: capabilities } },
        h(DirectorySearch, { catalog: 'groups', locale: 'zh', query: {}, onChange }),
      ),
    ),
  )
  const radio = host.querySelector<HTMLInputElement>('input[value="text"]')!
  await act(async () => radio.click())
  await fill('textarea[aria-label="RSQL"]', "name=='unterminated")
  await act(async () => button('应用').click())
  expect(onChange).not.toHaveBeenCalled()
  expect(host.textContent).toMatch(/位置|position/)
  expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe("name=='unterminated")
})
it('round trips query state while preserving other directory and selection coordinates', () => {
  const params = new URLSearchParams(
      'policy=one&groups.filter=name%3D%3Dx&groups.cursor=old&devices.cursor=kept',
    ),
    query = {
      filter: "(name=='a',name=='b');deleted==false",
      limit: 50,
      sort: ['name'],
      fields: ['name'],
    }
  const next = writeCatalogQuery(params, query, 'groups.')
  expect(catalogQuery(next, 'groups.')).toEqual(query)
  expect(next.get('groups.cursor')).toBeNull()
  expect(next.get('devices.cursor')).toBe('kept')
  expect(next.get('policy')).toBe('one')
})
it('removes the last condition from nested visual groups without retaining an invalid empty group', async () => {
  const onChange = vi.fn()
  await act(async () =>
    root.render(
      h(
        DirectoryCatalogContext.Provider,
        { value: { groups: capabilities } },
        h(DirectorySearch, { catalog: 'groups', locale: 'zh', query: {}, onChange }),
      ),
    ),
  )
  await act(async () => host.querySelector<HTMLElement>('.directory-advanced summary')!.click())
  await act(async () => button('添加分组').click())
  await act(async () => button('移除条件').click())
  await act(async () => button('应用').click())
  expect(onChange).toHaveBeenCalledWith({})
  expect(host.querySelectorAll('.directory-condition-group')).toHaveLength(0)
})
