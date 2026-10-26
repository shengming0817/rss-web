import { it, expect } from 'vitest'
import { readListLocation, listLocation } from './list-location'
it('preserves page, filter and search through detail and back links', () => {
  const query = { q: 'Office', platform: 'windows', cursor: 'page-2' }
  const state = readListLocation(query)
  expect(listLocation(state.search, state.platform, state.cursor)).toEqual(query)
  expect(readListLocation({ q: ['bad'], platform: 'other', cursor: 'x'.repeat(4097) })).toEqual({
    search: '',
    platform: 'all',
    cursor: null,
  })
  expect(listLocation('', 'all', null)).toEqual({})
})
