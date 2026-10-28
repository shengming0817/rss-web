import { it, expect } from 'vitest'
import { readListLocation, listLocation } from './list-location'
it('round trips an accepted query and page history through detail navigation', () => {
  const query = {
    filter: "platform=='windows'",
    sort: ['-key'],
    fields: ['key', 'reference'],
    limit: 1,
    cursor: 'YWJj',
  }
  const location = listLocation(query, [undefined])
  expect(readListLocation(location)).toEqual({ query, trail: [undefined] })
  expect(readListLocation({ q: 'Office', platform: 'windows' }).error).toBeTruthy()
  expect(readListLocation({ cursor: 'x'.repeat(4097) }).error).toBeTruthy()
  expect(readListLocation({ fields: ['key'] }).error).toBeTruthy()
})
