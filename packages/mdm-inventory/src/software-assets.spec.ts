import { expect, it, vi } from 'vitest'
import {
  createSoftwareAssets,
  type SoftwareAssetsPort,
  type SoftwareMutation,
  type SoftwareTask,
} from './software-assets'

const id = '00000000-0000-4000-8000-000000000001'
const operationId = '00000000-0000-4000-8000-000000000002'
const port = (methods: Partial<SoftwareAssetsPort>) => methods as SoftwareAssetsPort

it('does not combine a page with a different software query coordinate', async () => {
  const task: SoftwareTask = {
    task: id,
    status: 'completed',
    resultState: 'retained',
    failure: null,
    context: 'associated_device',
    coordinate: 'first',
    asOf: 10,
    processed: 1,
    unknown: 0,
  }
  const assets = createSoftwareAssets(
    port({
      buckets: async () => ({ task: id, coordinate: 'second', items: [], nextCursor: null }),
    }),
  )
  await expect(assets.buckets(task, {})).rejects.toMatchObject({ status: 409 })
})

it('looks up the original operation and rejects an unrelated configuration receipt', async () => {
  const mutate = vi
    .fn<SoftwareAssetsPort['mutate']>()
    .mockRejectedValue({ status: 503, code: 'operation_unknown' })
  const receipt = vi
    .fn<SoftwareAssetsPort['receipt']>()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ kind: 'written', resource: 'standard', id, revision: 5 })
  const assets = createSoftwareAssets(port({ mutate, receipt }))
  const intent: SoftwareMutation = {
    kind: 'mapping',
    id,
    operation: {
      operationId,
      expectedRevision: 4,
      input: { action: 'delete' },
    },
  }
  await expect(assets.mutate(intent)).rejects.toMatchObject({ code: 'operation_unknown' })
  await expect(assets.receipt(intent)).resolves.toBeNull()
  await expect(assets.receipt(intent)).rejects.toThrow('Wrong software asset operation receipt')
  expect(receipt).toHaveBeenCalledWith(operationId)
  expect(mutate).toHaveBeenCalledTimes(1)
})

it('reports local input rejection without invoking the mutation port', async () => {
  const mutate = vi.fn<SoftwareAssetsPort['mutate']>()
  const assets = createSoftwareAssets(port({ mutate }))
  await expect(
    assets.mutate({
      kind: 'mapping',
      id: 'invalid',
      operation: { operationId, expectedRevision: 0, input: { action: 'delete' } },
    }),
  ).rejects.toMatchObject({ cause: 'client', code: 'invalid_input' })
  expect(mutate).not.toHaveBeenCalled()
})
