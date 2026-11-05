import { useRef } from 'react'
import { hashMaterial } from '@rss/mdm-content'
import type { MaterialHashFile } from './ArtifactAuthor'
import { fileMaterial, type OwnedMaterialSource } from './MaterialSource'
import type { useAction } from './AdminUi'
import { useProtectedDelivery } from './useProtectedDelivery'

/** Authoring metadata shares content's incremental hash without retaining a File after calculation. */
export function useMaterialHash(
  permitted: boolean,
  action: ReturnType<typeof useAction>,
): MaterialHashFile {
  const active = useRef<{ source: OwnedMaterialSource; controller: AbortController } | null>(null),
    delivery = useProtectedDelivery(() => {
      active.current?.controller.abort()
      active.current?.source.release()
      active.current = null
    }, permitted)
  return (file, apply) => {
    void action.run(async () => {
      const source = fileMaterial(file),
        controller = new AbortController(),
        generation = delivery.capture()
      active.current = { source, controller }
      try {
        const sha256 = await hashMaterial(source.source, controller.signal)
        if (delivery.isCurrent(generation)) apply({ length: source.source.length, sha256 })
      } catch (error) {
        if (controller.signal.aborted) throw error
        throw { cause: 'client', code: 'input_changed' }
      } finally {
        source.release()
        if (active.current?.source === source) active.current = null
      }
    })
  }
}
