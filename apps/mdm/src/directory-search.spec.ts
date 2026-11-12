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
      operators: ['Eq', 'Icontains'],
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
