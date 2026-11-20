<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { DENSITIES, LOCALES, PAGE_SIZES, THEMES, useSettingsStore } from '../../stores/settings'
import { oneOf } from '../../stores/storage'
import Dialog from '../ui/Dialog.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import Switch from '../ui/Switch.vue'

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const settings = useSettingsStore()

const themeOptions = computed(() =>
  THEMES.map((theme) => ({ value: theme, label: t(`settings.themes.${theme}`) })),
)

// Each language is named in its own language in both message files, so the names do not change with the locale.
const languageOptions = computed(() =>
  LOCALES.map((locale) => ({ value: locale, label: t(`settings.languages.${locale}`) })),
)

const densityOptions = computed(() =>
  DENSITIES.map((density) => ({ value: density, label: t(`settings.densities.${density}`) })),
)

const pageSizeOptions =PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))

// The store keeps the page size as a number; the segmented control speaks strings.
const pageSize = computed({
  get: () => String(settings.pageSize),
  set: (value) => {
    settings.pageSize = oneOf(PAGE_SIZES, Number(value), settings.pageSize)
  },
})

const LABEL_CLASS = 'text-sm text-text-muted'
</script>

<template>
  <Dialog v-model:open="open" :title="t('settings.title')" :close-label="t('settings.close')">
    <div class="flex flex-col gap-4">
      <div class="flex flex-col items-start gap-1.5">
        <span data-testid="setting-label" :class="LABEL_CLASS" aria-hidden="true">
          {{ t('settings.theme') }}
        </span>
        <SegmentedControl v-model="settings.theme" :options="themeOptions" :label="t('settings.theme')" />
      </div>
      <div class="flex flex-col items-start gap-1.5">
        <span data-testid="setting-label" :class="LABEL_CLASS" aria-hidden="true">
          {{ t('settings.pageSize') }}
        </span>
        <SegmentedControl v-model="pageSize" :options="pageSizeOptions" :label="t('settings.pageSize')" />
      </div>
      <div class="flex flex-col items-start gap-1.5">
        <span data-testid="setting-label" :class="LABEL_CLASS" aria-hidden="true">
          {{ t('settings.language') }}
        </span>
        <SegmentedControl
          v-model="settings.locale"
          :options="languageOptions"
          :label="t('settings.language')"
        />
      </div>
      <div class="flex flex-col items-start gap-1.5">
        <span data-testid="setting-label" :class="LABEL_CLASS" aria-hidden="true">
          {{ t('settings.density') }}
        </span>
        <SegmentedControl v-model="settings.density" :options="densityOptions" :label="t('settings.density')" />
      </div>
      <Switch v-model="settings.showDescriptions" :label="t('settings.showDescriptions')" />
    </div>
  </Dialog>
</template>
