<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { architectures, platforms, releaseChannels } from '../clients/packages'
const runtime = useMdm(),
  { t } = useI18n(),
  { run, busy, failure } = useOperation()
const platform = ref<(typeof platforms)[number]>('windows'),
  architecture = ref<(typeof architectures)[number]>('x86_64'),
  channel = ref<(typeof releaseChannels)[number]>('production')
const packages = ref<Awaited<ReturnType<typeof runtime.onboarding.packages.list>>>([])
const matching = computed(() =>
  packages.value.filter(
    (p) =>
      p.target.platform === platform.value &&
      p.target.architecture === architecture.value &&
      p.channel === channel.value,
  ),
)
function refresh() {
  void run(
    () => runtime.onboarding.packages.list(),
    (v) => {
      packages.value = v
    },
  )
}
refresh()
</script>
<template>
  <section :aria-busy="busy" class="device-console">
    <h1>{{ t('onboarding.downloads') }}</h1>
    <p>{{ t('onboarding.downloadNote') }}</p>
    <p v-if="runtime.demo" class="mdm-source">{{ t('mdm.mock') }}</p>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <label
      >{{ t('devices.platform')
      }}<select v-model="platform">
        <option v-for="p in platforms" :key="p" :value="p">{{ p }}</option>
      </select></label
    >
    <label
      >{{ t('onboarding.architecture')
      }}<select v-model="architecture">
        <option v-for="a in architectures" :key="a" :value="a">{{ a }}</option>
      </select></label
    >
    <label
      >{{ t('onboarding.channel')
      }}<select v-model="channel">
        <option v-for="c in releaseChannels" :key="c" :value="c">{{ c }}</option>
      </select></label
    >
    <button type="button" :disabled="busy" @click="refresh">{{ t('devices.reload') }}</button>
    <p v-if="!busy && !failure && !matching.length">{{ t('onboarding.noInstaller') }}</p>
    <article v-for="p in matching" :key="p.releaseId">
      <h2>{{ p.version }} · {{ p.filename }}</h2>
      <p>{{ t('onboarding.fileSize') }}: {{ p.length }}</p>
      <p>SHA-256: {{ p.installerSha256.map((n) => n.toString(16).padStart(2, '0')).join('') }}</p>
      <a :href="runtime.onboarding.packages.content(p.releaseId)" :download="p.filename">{{
        t('onboarding.download')
      }}</a>
    </article>
    <p>{{ t('onboarding.sameDirectory') }}</p>
  </section>
</template>
