import * as api from '@rss/api/mdm-operations'
import { validateResourceResponse, validateResourceWrite } from '@rss/api/mdm-validators'
import { allOf, nextCursor, projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { ResourcesPort } from '@rss/mdm-resources'
import { resourceKinds, sameArtifact, validateVersionDraft, variantKey } from '@rss/mdm-resources'
import { count, enumeration, nullable, text } from './decode'
import { requestInput, windowQuery } from './inventory-values'
import {
  agentDefinition,
  declarationInput,
  nativeDefinition,
  resourcePresentation,
  resourceRead,
} from './resource-values'

import { prepareVersionMaterials, reconstructResourceMaterial } from './resource-authoring'

const fields = {
  id: text,
  revision: count,
  kind: (value: unknown) => enumeration(value, resourceKinds),
  activeVersion: (value: unknown) => nullable(value, text),
  presentation: (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid resource presentation')
    return resourcePresentation(value as Readonly<Record<string, unknown>>)
  },
}
export function createResourcesAdapter(transport: HttpTransport): ResourcesPort {
  return {
    references: (id, version, query = {}) =>
      api.getApiV1ResourcesByIdVersionsByVersionReferences(
        transport,
        { pathParams: { id, version }, query: windowQuery(query) },
        (value) => ({
          items: value.items.map((item) => ({
            ...item,
            id: text(item.id),
            version: nullable(item.version, text),
          })),
          nextCursor: nextCursor(value.nextCursor),
        }),
      ),
    reconstruct: async (target) => {
      const source = await api.getApiV1ResourcesById(
        transport,
        { pathParams: { id: target.resource } },
        (value) => resourceRead(value, target.resource),
      )
      return reconstructResourceMaterial(source, target)
    },
    prepareVersion: async (draft) => {
      validateVersionDraft(draft)
      const source = await api.getApiV1ResourcesById(
        transport,
        { pathParams: { id: draft.resource } },
        (value) => resourceRead(value, draft.resource),
      )
      if (source.revision !== draft.expectedRevision)
        throw { cause: 'client', status: 409, code: 'configuration_changed' }
      if (
        source.kind !== draft.kind ||
        source.versions.some((version) => version.id === draft.version)
      )
        throw { cause: 'client', code: 'invalid_input' }
      for (const variant of draft.variants) {
        const declaration = variant.declaration
        if (
          (declaration.kind === 'script' || declaration.kind === 'configuration') &&
          !draft.contents.some(
            (content) =>
              variantKey({
                key: content.variant,
                platform: content.platform,
                architecture: content.architecture,
              }) === variantKey(variant),
          ) &&
          !source.versions.some((version) =>
            version.variants.some(
              (original) =>
                original.declaration.kind === declaration.kind &&
                'artifact' in original.declaration &&
                variantKey(original) === variantKey(variant) &&
                sameArtifact(original.declaration.artifact, declaration.artifact),
            ),
          )
        )
          throw { cause: 'client', code: 'material_source_required' }
      }
      return prepareVersionMaterials(draft)
    },
    list: (query, kind, signal) =>
      api.getApiV1Resources(
        transport,
        {
          signal,
          query: queryParameters({
            limit: 20,
            ...query,
            ...(kind === undefined ? {} : { filter: allOf(`kind==${kind}`, query.filter) }),
          }),
        },
        (value) => projectedPage(value, fields, query.fields, ['id']),
      ),
    read: (id, signal) =>
      api.getApiV1ResourcesById(transport, { pathParams: { id }, signal }, (value) =>
        resourceRead(value, id),
      ),
    blueprints: () =>
      api.getApiV1CollectionBlueprints(transport, {}, (value) => ({
        categories: [...value.categories],
        items: value.items.map((blueprint) => ({
          id: blueprint.id,
          version: blueprint.version,
          presentation: resourcePresentation(blueprint.presentation),
          platform: blueprint.platform,
          definition:
            blueprint.definition.kind === 'agent_collection'
              ? {
                  kind: blueprint.definition.kind,
                  template: agentDefinition(blueprint.definition.template),
                }
              : blueprint.definition.kind === 'native_collection'
                ? {
                    kind: blueprint.definition.kind,
                    template: nativeDefinition(blueprint.definition.template),
                  }
                : {
                    kind: blueprint.definition.kind,
                    content: structuredClone(blueprint.definition.content),
                  },
        })),
      })),
    change: (id, change) => {
      const input =
        change.input.action === 'version'
          ? {
              ...change.input,
              variants: change.input.variants.map((variant) => ({
                ...variant,
                declaration: declarationInput(variant.declaration),
              })),
            }
          : change.input
      return api.postApiV1ResourcesById(
        transport,
        { pathParams: { id }, body: requestInput({ ...change, input }, validateResourceWrite) },
        (value) => {
          if (change.input.action === 'instantiate') return resourceRead(value, id)
          if (
            !validateResourceResponse(value) ||
            !('request' in value) ||
            value.resource !== id ||
            value.request !== change.operationId
          )
            throw new Error('Wrong resource operation receipt')
          return {
            resource: id,
            request: value.request,
            storageRevision: count(value.storageRevision),
          }
        },
      )
    },
  }
}
