import { expect, it } from 'vitest'
import { chunkBytes } from '@rss/mdm-content'
import { fileMaterial, bufferedMaterial } from './MaterialSource'

it('reads File through bounded slices and prevents any new read after its local handle is released', async () => {
  const original = new File(['abcdef'], 'source.bin'),
    source = fileMaterial(original)
  expect(new Uint8Array(await source.source.read(2, 3))).toEqual(new TextEncoder().encode('cde'))
  await expect(source.source.read(0, chunkBytes + 1)).rejects.toMatchObject({
    code: 'material_source_required',
  })
  source.release()
  await expect(source.source.read(0, 1)).rejects.toMatchObject({ code: 'material_source_required' })
  expect(original.size).toBe(6)
})
it('hands off independent bounded chunks and erases owned buffered input on release', async () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer,
    source = bufferedMaterial(bytes),
    chunk = await source.source.read(1, 2)
  source.release()
  expect(new Uint8Array(bytes)).toEqual(new Uint8Array(3))
  expect(new Uint8Array(chunk)).toEqual(new Uint8Array([2, 3]))
  await expect(source.source.read(0, 1)).rejects.toMatchObject({ code: 'material_source_required' })
  new Uint8Array(chunk).fill(0)
})
