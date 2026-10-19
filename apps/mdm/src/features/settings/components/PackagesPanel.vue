<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage } from '@rss/core/components'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts, useSettingsAction } from '../useSettingsAction'
import type { PublishPackage } from '../clients/packages'
import { platforms, architectures, releaseChannels } from '../../enrollment/clients/packages'
import CatalogLocator from '../../policies/components/CatalogLocator.vue'
import OperationNotice from './OperationNotice.vue'
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.settings.packages
const { canRead, canWrite } = usePermission('agent_enrollment_read', 'release_publish'),
  { canWrite: canWithdraw } = usePermission('agent_enrollment_read', 'software_withdraw')
const { run, busy, failure, pending, locked, submit, resolveConflict, compared, markCompared } =
  useSettingsAction(() => 'packages')
const packages = ref<Awaited<ReturnType<typeof client.read>>>([]),
  resource = ref(''),
  version = ref(''),
  variant = ref(''),
  manifestArtifact = ref(''),
  platform = ref<'windows' | 'macos'>('windows'),
  architecture = ref<'x86_64' | 'aarch64'>('x86_64'),
  channel = ref<'test' | 'pilot' | 'production'>('test')
async function load() {
  return run(
    () => client.read(),
    (v) => (packages.value = v),
  )
}
async function compare() {
  if (await load()) markCompared()
}
async function publish() {
  if (!canWrite.value) return
  const input: PublishPackage = {
    resource: resource.value,
    version: version.value,
    variant: variant.value,
    target: { platform: platform.value, architecture: architecture.value },
    channel: channel.value,
    manifestArtifact: manifestArtifact.value,
  }
  await submit(
    'publish',
    0,
    {
      resource: input.resource,
      version: input.version,
      variant: input.variant,
      platform: input.target.platform,
      architecture: input.target.architecture,
      channel: input.channel,
      manifestArtifact: input.manifestArtifact,
    },
    (id) => client.publish(id, input),
    () => {
      queueMicrotask(() => void load())
    },
  )
}
async function withdraw(release: string) {
  if (!canWithdraw.value) return
  await submit(
    'withdraw',
    0,
    { release },
    (id) => client.withdraw(id, release),
    () => {
      queueMicrotask(() => void load())
    },
  )
}
onMounted(load)
useSettingsFacts(() => {
  packages.value = []
})
</script>
<template>
  <UiMessage tone="info" :title="t('settings.packageHint')" />
  <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  <UiButton :disabled="busy || !canRead" @click="load">{{ t('settings.reload') }}</UiButton
  ><OperationNotice
    :operation="pending"
    :busy="busy"
    :can-write="canWrite || canWithdraw"
    :query-supported="false"
    :compared="compared"
    @compare="compare"
    @edit="resolveConflict"
  />
  <RouterLink :to="{ name: 'software-imports', params: { tenant: runtime.tenant } }">{{
    t('software.imports')
  }}</RouterLink>
  <form class="settings-form" @submit.prevent="publish">
    <fieldset :disabled="locked || !canWrite">
      <legend>{{ t('settings.publishPackage') }}</legend>
      <label
        >{{ t('policies.resources') }}<input v-model="resource" required maxlength="128" /></label
      ><CatalogLocator v-model="resource" collection="resources" :disabled="locked" /><label
        >{{ t('settings.packageVersion')
        }}<input v-model="version" required maxlength="128" /></label
      ><label>{{ t('settings.variant') }}<input v-model="variant" required maxlength="128" /></label
      ><label
        >{{ t('settings.manifestArtifact')
        }}<input v-model="manifestArtifact" required maxlength="128" /></label
      ><label
        >{{ t('settings.packagePlatform')
        }}<select v-model="platform">
          <option v-for="v in platforms" :key="v" :value="v">{{ v }}</option>
        </select></label
      ><label
        >{{ t('settings.architecture')
        }}<select v-model="architecture">
          <option v-for="v in architectures" :key="v" :value="v">{{ v }}</option>
        </select></label
      ><label
        >{{ t('settings.releaseChannel')
        }}<select v-model="channel">
          <option v-for="v in releaseChannels" :key="v" :value="v">{{ v }}</option>
        </select></label
      ><UiButton type="submit">{{ t('settings.publishPackage') }}</UiButton>
    </fieldset>
  </form>
  <article v-for="p in packages" :key="p.releaseId" class="console-panel">
    <h2>{{ p.filename }} · {{ p.version }}</h2>
    <p>{{ p.target.platform }} / {{ p.target.architecture }} · {{ p.channel }}</p>
    <p>
      {{ t('settings.fingerprint') }}
      <code>{{ p.installerSha256.map((b) => b.toString(16).padStart(2, '0')).join('') }}</code>
    </p>
    <p>{{ t('settings.origin') }} {{ p.origin }}</p>
    <UiButton :disabled="locked || !canWithdraw" @click="withdraw(p.releaseId)">{{
      t('settings.withdrawPackage')
    }}</UiButton>
  </article>
</template>
