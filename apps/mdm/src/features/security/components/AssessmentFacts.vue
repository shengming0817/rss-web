<script setup lang="ts">
import {
  VAlert,
  VExpansionPanel,
  VExpansionPanels,
  VList,
  VListItem,
  VTable,
} from 'vuetify/components'
import { useI18n } from 'vue-i18n'
import type { ComplianceAssessment } from '../clients/compliance-model'
defineProps<{ assessment: ComplianceAssessment }>()
const { t } = useI18n()
const at = (seconds: number) =>
  seconds <= 253402300799 ? new Date(seconds * 1000).toISOString() : String(seconds)
</script>
<template>
  <v-table :aria-label="t('security.conclusion')"
    ><tbody>
      <tr>
        <th>{{ t('security.conclusion') }}</th>
        <td>
          {{ t(`security.state.${assessment.status}`) }} ·
          {{ t(`security.reason.${assessment.reason}`) }}
        </td>
      </tr>
      <tr>
        <th>{{ t('security.ruleRevision') }}</th>
        <td>{{ assessment.ruleId }} / {{ assessment.ruleVersion }}</td>
      </tr>
      <tr>
        <th>{{ t('security.evaluatedAt') }}</th>
        <td>{{ at(assessment.evaluatedAt) }}</td>
      </tr>
      <tr>
        <th>{{ t('security.watermark') }}</th>
        <td>{{ assessment.factWatermark }} · {{ assessment.dictionaryVersion }}</td>
      </tr>
      <tr>
        <th>{{ t('security.condition') }}</th>
        <td>{{ t(`security.state.${assessment.condition}`) }}</td>
      </tr>
      <tr>
        <th>{{ t('security.platform') }}</th>
        <td>
          {{ t(`security.platforms.${assessment.applicability.platform}`) }} ·
          {{ t(`security.state.${assessment.applicability.platformDecision}`) }}
        </td>
      </tr>
    </tbody></v-table
  >
  <v-expansion-panels class="my-3"
    ><v-expansion-panel :title="t('security.evidence')"
      ><template #text>
        <h3 class="text-subtitle-1">{{ t('security.platformSources') }}</h3>
        <v-list
          ><v-list-item
            v-for="source in assessment.applicability.sources"
            :key="`${source.source}:${source.registration}:${source.generation}`"
            :title="source.source"
            :subtitle="`${t('devices.registration')} ${source.registration} / ${source.generation} · ${t('security.epoch')} ${source.epoch}`"
        /></v-list>
        <h3 class="text-subtitle-1">{{ t('security.groupInputs') }}</h3>
        <v-table
          ><tbody>
            <tr v-for="(group, index) in assessment.groups" :key="group.id">
              <td>{{ group.id }}</td>
              <td>
                {{ t('devices.revision') }} {{ group.revision }} · {{ t('devices.memberVersion') }}
                {{ group.memberVersion }}
              </td>
              <td>{{ group.memberSet ?? '—' }}</td>
              <td>{{ t('security.watermark') }} {{ group.assetWatermark ?? '—' }}</td>
              <td>{{ t(`security.state.${assessment.applicability.groups[index]!.decision}`) }}</td>
            </tr>
          </tbody></v-table
        >
        <h3 class="text-subtitle-1 mt-4">{{ t('security.explanations') }}</h3>
        <v-list
          ><v-list-item
            v-for="(explanation, index) in assessment.explanations"
            :key="index"
            :title="
              explanation.path.length ? explanation.path.join('.') : t('security.rootCondition')
            "
            :subtitle="t(`security.state.${explanation.outcome}`)"
        /></v-list>
        <h3 class="text-subtitle-1">{{ t('security.factReferences') }}</h3>
        <p class="text-body-2 mb-3">{{ t('security.evidenceHint') }}</p>
        <section
          v-for="field in assessment.evidence"
          :key="JSON.stringify([field.context, field.field])"
          class="mb-4"
        >
          <h4 class="text-subtitle-2">{{ field.field }}</h4>
          <v-table v-for="source in field.sources" :key="source.source"
            ><tbody>
              <tr>
                <th>{{ t('devices.source') }}</th>
                <td>{{ source.source }}</td>
              </tr>
              <tr>
                <th>{{ t('devices.snapshot') }}</th>
                <td>{{ source.snapshotId }}</td>
              </tr>
              <tr>
                <th>{{ t('security.epoch') }}</th>
                <td>{{ source.epoch ?? '—' }}</td>
              </tr>
              <tr>
                <th>{{ t('devices.registration') }}</th>
                <td>
                  {{ source.registration ?? '—' }} / {{ source.registrationGeneration ?? '—' }}
                </td>
              </tr>
              <tr>
                <th>{{ t('devices.observed') }}</th>
                <td>{{ at(source.observedAt) }}</td>
              </tr>
              <tr>
                <th>{{ t('devices.received') }}</th>
                <td>{{ at(source.receivedAt) }}</td>
              </tr>
              <tr>
                <th>{{ t('devices.actor') }}</th>
                <td>{{ source.actor ?? '—' }}</td>
              </tr>
            </tbody></v-table
          >
          <v-alert v-if="!field.sources.length" type="info" variant="tonal">{{
            t('security.noEvidence')
          }}</v-alert>
        </section>
      </template></v-expansion-panel
    ></v-expansion-panels
  >
</template>
