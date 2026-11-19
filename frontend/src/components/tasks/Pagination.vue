<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import IconButton from '../ui/IconButton.vue'

const FIRST_PAGE = 1

const { pages } = defineProps<{
  /** How many pages there are; with one or none there is nowhere to go and nothing is shown. */
  pages: number
}>()

/** The page shown, from 1. */
const page = defineModel<number>('page', { required: true })

const { t } = useI18n()
</script>

<template>
  <nav v-if="pages > 1" :aria-label="t('pagination.label')" class="flex items-center justify-center gap-3">
    <IconButton :label="t('pagination.previous')" :disabled="page <= FIRST_PAGE" @click="page -= 1">
      <ChevronLeft aria-hidden="true" />
    </IconButton>
    <span data-testid="page-position" class="text-sm text-text-muted tabular-nums">
      {{ t('pagination.page', { page, pages }) }}
    </span>
    <IconButton :label="t('pagination.next')" :disabled="page >= pages" @click="page += 1">
      <ChevronRight aria-hidden="true" />
    </IconButton>
  </nav>
</template>
