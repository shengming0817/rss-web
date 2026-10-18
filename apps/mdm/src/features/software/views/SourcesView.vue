<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { sourceDefinition, type SourceChange } from '../clients/lifecycle'
import { deviceBinding } from '../../devices/useDeviceBinding'
import PageFrame from '../../../components/PageFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.software.lifecycle,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const id = ref(''),
  revision = ref('1'),
  kind = ref<'private' | 'winget_rest' | 'winget_community' | 'brew_tap'>('private'),
  location = ref(''),
  repository = ref(''),
  commit = ref(''),
  tap = ref(''),
  identifier = ref(''),
  current = ref<Awaited<ReturnType<typeof client.source>>>()
let pending: { id: string; revision: string; operationId: string } | undefined
function read() {
  const target = uncertain.value && pending ? pending : { id: id.value, revision: revision.value }
  void run(
    () => client.source(target.id, target.revision),
    (v) => {
      current.value = v
      id.value = target.id
      revision.value = target.revision
      if (v.lifecycle.operation === pending?.operationId) {
        uncertain.value = false
        pending = undefined
      }
    },
  )
}
function change(input: SourceChange) {
  if (busy.value || uncertain.value) return
  const target =
    input.action === 'register'
      ? { id: input.definition.id, revision: input.definition.revision }
      : current.value
        ? { id: current.value.source.id, revision: current.value.source.revision }
        : { id: id.value, revision: revision.value }
  const body = operation(
    input,
    input.action === 'register' ? 0 : (current.value?.lifecycle.revision ?? 0),
  )
  pending = { ...target, operationId: body.operationId }
  void runWrite(
    () => client.changeSource(target.id, target.revision, body),
    (v) => {
      current.value = v
      pending = undefined
    },
  )
}
function register() {
  try {
    const protocol =
      kind.value === 'private'
        ? { kind: kind.value }
        : kind.value === 'winget_rest'
          ? { kind: kind.value, location: location.value, identifier: identifier.value }
          : {
              kind: kind.value,
              repository: repository.value,
              commit: commit.value,
              ...(kind.value === 'brew_tap' ? { tap: tap.value } : {}),
            }
    change({
      action: 'register',
      definition: sourceDefinition({ id: id.value, revision: revision.value, protocol }),
    })
  } catch {
    failure.value = 'invalidRequest'
  }
}
watch(
  () => deviceBinding(runtime),
  () => {
    current.value = undefined
    pending = undefined
    id.value = ''
    revision.value = '1'
  },
  { flush: 'sync' },
)
</script>
<template>
  <PageFrame :title="t('software.sources')" :busy="busy" :failure="failure"
    ><p>{{ t('software.discoveryUnavailable') }}</p>
    <form @submit.prevent="read">
      <fieldset :disabled="busy || uncertain">
        <label>{{ t('software.source') }}<input v-model="id" class="ui-input" required /></label
        ><label
          >{{ t('software.sourceRevision')
          }}<input v-model="revision" class="ui-input" required /></label
        ><UiButton type="submit">{{ t('policies.open') }}</UiButton>
      </fieldset>
    </form>
    <UiButton :disabled="busy" @click="read">{{ t('software.reconcile') }}</UiButton>
    <section v-if="current" class="console-panel">
      <h2>{{ current.source.id }} / {{ current.source.revision }}</h2>
      <p>
        {{ current.source.protocol.kind }} ·
        {{ t(`software.lifecycle_${current.lifecycle.state}`) }}
      </p>
      <p>{{ current.lifecycle.operation }} · {{ current.lifecycle.actor }}</p>
      <UiButton
        :disabled="busy || uncertain || current.lifecycle.state === 'enabled'"
        @click="change({ action: 'enable' })"
        >{{ t('software.enable') }}</UiButton
      ><UiButton
        :disabled="busy || uncertain || current.lifecycle.state !== 'enabled'"
        @click="change({ action: 'disable' })"
        >{{ t('software.disable') }}</UiButton
      >
      <pre>{{ JSON.stringify(current.snapshot, null, 2) }}</pre>
    </section>
    <details class="console-panel">
      <summary>{{ t('software.registerSource') }}</summary>
      <form @submit.prevent="register">
        <fieldset :disabled="busy || uncertain">
          <label
            >{{ t('software.kind')
            }}<select v-model="kind" class="ui-input">
              <option
                v-for="protocol in ['private', 'winget_rest', 'winget_community', 'brew_tap']"
                :key="protocol"
                :value="protocol"
              >
                {{ protocol }}
              </option>
            </select></label
          ><template v-if="kind === 'winget_rest'"
            ><label
              >{{ t('software.location')
              }}<input v-model="location" class="ui-input" type="url" required /></label
            ><label
              >{{ t('policies.id')
              }}<input v-model="identifier" class="ui-input" required /></label></template
          ><template v-if="kind === 'winget_community' || kind === 'brew_tap'"
            ><label
              >{{ t('software.repository')
              }}<input v-model="repository" class="ui-input" type="url" required /></label
            ><label
              >{{ t('software.commit')
              }}<input
                v-model="commit"
                class="ui-input"
                pattern="[0-9a-f]{40}"
                required /></label></template
          ><label v-if="kind === 'brew_tap'"
            >Tap<input v-model="tap" class="ui-input" required /></label
          ><UiButton type="submit">{{ t('software.registerSource') }}</UiButton>
        </fieldset>
      </form>
    </details></PageFrame
  >
</template>
