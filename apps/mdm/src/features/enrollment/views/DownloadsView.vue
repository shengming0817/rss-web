<script setup lang="ts">
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VCardTitle,
  VCol,
  VExpansionPanels,
  VExpansionPanel,
  VRow,
} from 'vuetify/components'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import MdmPage from '../../../ui/MdmPage.vue'
import { architectures, platforms } from '../clients/packages'
const runtime = useMdm(),
  { t } = useI18n(),
  { run, busy, failure } = useOperation()
const packages = ref<Awaited<ReturnType<typeof runtime.onboarding.packages.list>>>([])
const targets = computed(() =>
  platforms.flatMap((platform) =>
    architectures.map((architecture) => ({
      platform,
      architecture,
      title: `${platform === 'windows' ? 'Windows' : 'macOS'} · ${architecture === 'aarch64' ? 'ARM64' : 'x64'}`,
      packages: packages.value.filter(
        (p) => p.target.platform === platform && p.target.architecture === architecture,
      ),
    })),
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
  <MdmPage
    :title="t('onboarding.downloads')"
    :description="t('onboarding.downloadNote')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><v-btn variant="text" :disabled="busy" @click="refresh">{{
        t('devices.reload')
      }}</v-btn></template
    >
    <v-row>
      <v-col
        v-for="target in targets"
        :key="`${target.platform}/${target.architecture}`"
        cols="12"
        md="6"
      >
        <v-card
          variant="outlined"
          height="100%"
          :data-download-target="`${target.platform}/${target.architecture}`"
        >
          <v-card-title>{{ target.title }}</v-card-title>
          <v-card-text>
            <v-alert
              v-if="!busy && !failure && !target.packages.length"
              type="info"
              variant="tonal"
              >{{ t('onboarding.noInstaller') }}</v-alert
            >
            <div v-for="p in target.packages" :key="p.releaseId" class="mb-4">
              <p>{{ p.version }} · {{ p.filename }}</p>
              <p>{{ t('onboarding.fileSize') }}: {{ p.length }}</p>
              <v-btn
                color="primary"
                variant="flat"
                :href="runtime.onboarding.packages.content(p.releaseId)"
                :download="p.filename"
                >{{ t('onboarding.download') }} {{ target.title }}</v-btn
              >
              <v-expansion-panels class="mt-3" variant="accordion"
                ><v-expansion-panel :title="t('console.advanced')"
                  ><template #text
                    ><p class="text-break">
                      SHA-256:
                      {{ p.installerSha256.map((n) => n.toString(16).padStart(2, '0')).join('') }}
                    </p></template
                  ></v-expansion-panel
                ></v-expansion-panels
              >
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
    <v-alert type="info" variant="tonal" class="mt-4">{{ t('onboarding.sameDirectory') }}</v-alert>
  </MdmPage>
</template>
