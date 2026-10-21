<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { architectures, platforms } from '../clients/packages'
const runtime = useMdm(),
  { t } = useI18n(),
  { run, busy, failure } = useOperation()
const platform = ref<(typeof platforms)[number]>('windows'),
  architecture = ref<(typeof architectures)[number]>('x86_64')
const packages = ref<Awaited<ReturnType<typeof runtime.onboarding.packages.list>>>([])
const matching = computed(() =>
  packages.value.filter(
    (p) => p.target.platform === platform.value && p.target.architecture === architecture.value,
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
  <section :aria-busy="busy" class="console-public-page">
    <h1>{{ t('onboarding.downloads') }}</h1>
    <p>{{ t('onboarding.downloadNote') }}</p>
    <p v-if="runtime.demo" class="mdm-source">{{ t('mdm.mock') }}</p>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <div class="console-toolbar">
      <label
        >{{ t('devices.platform')
        }}<select v-model="platform" class="ui-input">
          <option v-for="p in platforms" :key="p" :value="p">{{ p }}</option>
        </select></label
      >
      <label
        >{{ t('onboarding.architecture')
        }}<select v-model="architecture" class="ui-input">
          <option v-for="a in architectures" :key="a" :value="a">{{ a }}</option>
        </select></label
      >
      <UiButton type="button" :disabled="!!busy" @click="refresh">{{
        t('devices.reload')
      }}</UiButton>
    </div>
    <p v-if="!busy && !failure && !matching.length">{{ t('onboarding.noInstaller') }}</p>
    <article v-for="p in matching" :key="p.releaseId" class="console-panel console-download">
      <h2>{{ p.version }} · {{ p.filename }}</h2>
      <p>{{ t('onboarding.fileSize') }}: {{ p.length }}</p>
      <details>
        <summary>{{ t('console.advanced') }}</summary>
        <p>SHA-256: {{ p.installerSha256.map((n) => n.toString(16).padStart(2, '0')).join('') }}</p>
      </details>
      <a
        v-if="p.format === 'nsis_exe' || p.format === 'macos_pkg'"
        :href="runtime.onboarding.packages.content(p.releaseId)"
        :download="p.filename"
        >{{ t('onboarding.download') }}</a
      >
      <p v-if="p.format !== 'nsis_exe' && p.format !== 'macos_pkg'">
        {{ t('registration.installerUnsupported') }}
      </p>
      <p>{{ t('onboarding.sameDirectory') }}</p>
    </article>
  </section>
</template>
