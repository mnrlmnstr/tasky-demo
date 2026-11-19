<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { formatNumber } from '../../i18n/numbers'
import { FIRST_PAGE } from '../../stores/listView'
import IconButton from '../ui/IconButton.vue'

// A button at the end of its range stays focusable: natively disabled, it would drop the keyboard
// focus of whoever just pressed it to get there.
const UNAVAILABLE_CLASS =
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent aria-disabled:hover:text-text-muted'

const { pages } = defineProps<{
  /** How many pages there are; with one or none there is nowhere to go and nothing is shown. */
  pages: number
}>()

/** The page shown, from 1. */
const page = defineModel<number>('page', { required: true })

const { t, locale } = useI18n()

const hasPrevious = computed(() => page.value > FIRST_PAGE)
const hasNext = computed(() => page.value < pages)

const position = computed(() =>
  t('pagination.page', { page: formatNumber(page.value, locale.value), pages: formatNumber(pages, locale.value) }),
)

function goBack(): void {
  if (hasPrevious.value) page.value -= 1
}

function goForward(): void {
  if (hasNext.value) page.value += 1
}
</script>

<template>
  <nav v-if="pages > 1" :aria-label="t('pagination.label')" class="flex items-center justify-center gap-3">
    <IconButton
      :label="t('pagination.previous')"
      :aria-disabled="hasPrevious ? undefined : 'true'"
      :class="UNAVAILABLE_CLASS"
      @click="goBack"
    >
      <ChevronLeft aria-hidden="true" />
    </IconButton>
    <span data-testid="page-position" class="text-sm text-text-muted tabular-nums">{{ position }}</span>
    <IconButton
      :label="t('pagination.next')"
      :aria-disabled="hasNext ? undefined : 'true'"
      :class="UNAVAILABLE_CLASS"
      @click="goForward"
    >
      <ChevronRight aria-hidden="true" />
    </IconButton>
  </nav>
</template>
