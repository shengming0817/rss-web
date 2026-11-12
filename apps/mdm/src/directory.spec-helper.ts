import type { DirectoryCapabilities } from '@rss/mdm-devices'
const field = (name: string, kind: DirectoryCapabilities['fields'][number]['kind'] = 'Text') => ({
  name,
  kind,
  filter: true,
  sort: true,
  output: true,
  nullable: false,
  operators: ['Eq', 'Ne', 'In', 'Icontains'],
  limitation: null,
})
/** Explicit component-test input; production capabilities come from the pinned artifact. */
export const directoryFixtures: Readonly<Record<string, DirectoryCapabilities>> = {
  resources: {
    maximum: 1000,
    fields: [
      field('id'),
      field('presentation.name'),
      field('presentation.category'),
      field('kind'),
      field('active', 'Boolean'),
    ],
  },
  endpoints: { maximum: 1000, fields: [field('id'), field('status'), field('channel')] },
  devices: {
    maximum: 1000,
    fields: [
      field('key'),
      field('search'),
      field('status'),
      field('channel'),
      field('platform'),
      field('endpoints'),
    ],
  },
  groups: {
    maximum: 1000,
    fields: [
      field('id'),
      field('name'),
      field('kind'),
      field('assetContext'),
      field('deleted', 'Boolean'),
    ],
  },
  savedQueries: {
    maximum: 1000,
    fields: [field('id'), field('name'), field('deleted', 'Boolean')],
  },
}
