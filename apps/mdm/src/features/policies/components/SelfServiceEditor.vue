<script setup lang="ts">
import { computed, useId } from 'vue'
import SelfServiceSelectors from './SelfServiceSelectors.vue'
import type { SelfServiceAccess } from '../clients/self-service-access'
defineProps<{ software?: boolean }>()
import { useI18n } from 'vue-i18n'
import { initialSelfService, type SelfService } from '../clients/model'
const model = defineModel<SelfService | undefined>()
const id = useId(),
  { t } = useI18n()
const keywords = computed({
  get: () => model.value?.keywords.join('\n') ?? '',
  set: (v: string) => {
    if (model.value)
      model.value.keywords = v
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
      ><input
        :id="`${id}-published`"
        data-field="published"
        type="checkbox"
        :checked="model?.published ?? false"
        @change="publish"
      />{{ t('policies.selfService.publish') }}</label
    >
    <p>{{ t('policies.selfService.publishHint') }}</p>
    <p>{{ t('policies.selfService.accessHint') }}</p>
    <template v-if="model">
      <p v-if="model.access === null" data-field="access-required" role="alert">
        {{ t('policies.selfService.accessRequired') }}
      </p>
      <label :for="`${id}-access`">{{ t('policies.selfService.access') }}</label
      ><select
        :id="`${id}-access`"
        v-model="accessKind"
        data-field="access"
        :required="model.published"
      >
        <option value="">{{ t('policies.selfService.choose') }}</option>
        <option value="device">{{ t('policies.selfService.device') }}</option>
        <option value="authenticated_user">
          {{ t('policies.selfService.authenticatedUser') }}
        </option>
        <option value="users">{{ t('policies.selfService.users') }}</option>
      </select>
      <SelfServiceSelectors v-if="model.access?.kind === 'users'" v-model="selectors" />
      <label :for="`${id}-name`">{{ t('policies.selfService.name') }}</label
      ><input
        :id="`${id}-name`"
        v-model="model.displayName"
        data-field="displayName"
        required
        maxlength="256"
      />
      <label :for="`${id}-description`">{{ t('policies.selfService.description') }}</label
      ><textarea :id="`${id}-description`" v-model="model.description" maxlength="4096" />
      <label :for="`${id}-prerequisites`">{{ t('policies.selfService.prerequisites') }}</label
      ><textarea :id="`${id}-prerequisites`" v-model="model.prerequisites" maxlength="4096" />
      <label :for="`${id}-effects`">{{ t('policies.selfService.effects') }}</label
      ><textarea :id="`${id}-effects`" v-model="model.sideEffects" maxlength="4096" />
      <label :for="`${id}-category`">{{ t('policies.selfService.category') }}</label
      ><input
        :id="`${id}-category`"
        v-model="model.category"
        data-field="category"
        required
        maxlength="128"
      />
      <label :for="`${id}-keywords`">{{ t('policies.selfService.keywords') }}</label
      ><textarea :id="`${id}-keywords`" v-model="keywords" />
      <template v-if="!software">
        <label :for="`${id}-ai`"
          ><input :id="`${id}-ai`" v-model="model.allowAi" data-field="allowAi" type="checkbox" />{{
            t('policies.selfService.allowAi')
          }}</label
        >
        <p>
          {{ t(model.allowAi ? 'policies.selfService.aiHint' : 'policies.selfService.manualHint') }}
        </p>
        <label :for="`${id}-risk`">{{ t('policies.selfService.risk') }}</label
        ><select :id="`${id}-risk`" v-model.number="model.riskLevel" data-field="riskLevel">
          <option :value="1">{{ t('policies.selfService.risk1') }}</option>
          <option :value="2">{{ t('policies.selfService.risk2') }}</option>
        </select>
      </template>
    </template>
  </fieldset>
</template>
