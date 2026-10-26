<script setup lang="ts">
import { VCheckbox, VSelect, VTextField, VTextarea } from 'vuetify/components'
import { controlEvent } from '../control-event'

import { computed, useId } from 'vue'
import SelfServiceSelectors from './SelfServiceSelectors.vue'
import type { SelfServiceAccess } from '../clients/self-service-access'
import { useI18n } from 'vue-i18n'
import { initialSelfService, type SelfService } from '../clients/model'
const model = defineModel<SelfService | undefined>()
const id = useId(),
  { t } = useI18n()
const keywords = computed({
  get: () => model.value?.presentation.keywords.join('\n') ?? '',
  set: (v: string) => {
    if (model.value)
      model.value.presentation.keywords = v
        .split('\n')
        .map((k) => k.trim())
        .filter(Boolean)
  },
})
const accessKind = computed({
  get: () => model.value?.access?.kind ?? '',
  set: (kind: string) => {
    if (!model.value) return
    model.value.access =
      kind === 'users'
        ? { kind, selectors: [] }
        : kind === 'device' || kind === 'authenticated_user'
          ? { kind }
          : null
  },
})
const selectors = computed({
  get: () => (model.value?.access?.kind === 'users' ? model.value.access.selectors : []),
  set: (selectors: Extract<SelfServiceAccess, { kind: 'users' }>['selectors']) => {
    if (model.value?.access?.kind === 'users') model.value.access = { kind: 'users', selectors }
  },
})
function publish(event: Event) {
  const published = (event.target as HTMLInputElement).checked
  if (!model.value && published) model.value = initialSelfService()
  else if (model.value) model.value.published = published
}
</script>
<template>
  <fieldset>
    <legend>{{ t('policies.selfService.title') }}</legend>
    <label :for="`${id}-published`"
      ><VCheckbox
        :id="`${id}-published`"
        data-field="published"
        :model-value="model?.published ?? false"
        @update:model-value="publish(controlEvent($event))"
        hide-details="auto"
      />{{ t('policies.selfService.publish') }}</label
    >
    <p>{{ t('policies.selfService.publishHint') }}</p>
    <p>{{ t('policies.selfService.accessHint') }}</p>
    <template v-if="model">
      <p v-if="model.access === null" data-field="access-required" role="alert">
        {{ t('policies.selfService.accessRequired') }}
      </p>
      <label :for="`${id}-access`">{{ t('policies.selfService.access') }}</label
      ><VSelect
        :id="`${id}-access`"
        v-model="accessKind"
        data-field="access"
        :required="model.published"
        :items="[
          { title: String(t('policies.selfService.choose')), value: '' },
          { title: String(t('policies.selfService.device')), value: 'device' },
          {
            title: String(t('policies.selfService.authenticatedUser')),
            value: 'authenticated_user',
          },
          { title: String(t('policies.selfService.users')), value: 'users' },
        ]"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
      <SelfServiceSelectors v-if="model.access?.kind === 'users'" v-model="selectors" />
      <label :for="`${id}-name`">{{ t('policies.selfService.name') }}</label
      ><VTextField
        :id="`${id}-name`"
        v-model="model.presentation.displayName"
        data-field="displayName"
        required
        maxlength="256"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
      <label :for="`${id}-description`">{{ t('policies.selfService.description') }}</label
      ><VTextarea
        :id="`${id}-description`"
        v-model="model.presentation.description"
        maxlength="4096"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
      <label :for="`${id}-prerequisites`">{{ t('policies.selfService.prerequisites') }}</label
      ><VTextarea
        :id="`${id}-prerequisites`"
        v-model="model.presentation.prerequisites"
        maxlength="4096"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
      <label :for="`${id}-effects`">{{ t('policies.selfService.effects') }}</label
      ><VTextarea
        :id="`${id}-effects`"
        v-model="model.presentation.sideEffects"
        maxlength="4096"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
      <label :for="`${id}-category`">{{ t('policies.selfService.category') }}</label
      ><VTextField
        :id="`${id}-category`"
        v-model="model.presentation.category"
        data-field="category"
        required
        maxlength="128"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
      <label :for="`${id}-keywords`">{{ t('policies.selfService.keywords') }}</label
      ><VTextarea
        :id="`${id}-keywords`"
        v-model="keywords"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
      <template>
        <label :for="`${id}-ai`"
          ><VCheckbox
            :id="`${id}-ai`"
            v-model="model.allowAi"
            data-field="allowAi"
            hide-details="auto"
          />{{ t('policies.selfService.allowAi') }}</label
        >
        <p>
          {{ t(model.allowAi ? 'policies.selfService.aiHint' : 'policies.selfService.manualHint') }}
        </p>
        <label :for="`${id}-risk`">{{ t('policies.selfService.risk') }}</label
        ><VSelect
          :id="`${id}-risk`"
          v-model.number="model.riskLevel"
          data-field="riskLevel"
          :items="[
            { title: String(t('policies.selfService.risk1')), value: 1 },
            { title: String(t('policies.selfService.risk2')), value: 2 },
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
        />
      </template>
    </template>
  </fieldset>
</template>
