<script setup lang="ts">
import { ArrowUpDown } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskOrdering } from '../../api/generated/client'
import { STATUS_FILTERS, useListViewStore } from '../../stores/listView'
import Button from '../ui/Button.vue'
import DropdownMenu from '../ui/DropdownMenu.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import DeadlineFilter from './DeadlineFilter.vue'

// In the order the menu lists them. Every ordering the API knows is here, so a new one does not
// compile until it has a label.
const SORT_MESSAGES: Record<TaskOrdering, string> = {
  '-created_at': 'toolbar.sort.newest',
  created_at: 'toolbar.sort.oldest',
  deadline: 'toolbar.sort.deadlineSoonest',
  '-deadline': 'toolbar.sort.deadlineLatest',
}
const SORT_ORDER: TaskOrdering[] = ['-created_at', 'created_at', 'deadline', '-deadline']

const { t } = useI18n()
const view = useListViewStore()

const statusOptions = computed(() =>
  STATUS_FILTERS.map((status) => ({
    value: status,
    label: status === 'all' ? t('toolbar.statusAll') : t(`task.status.${status}`),
  })),
)

const sortLabel = computed(() => t(SORT_MESSAGES[view.ordering]))

const sortItems = computed(() =>
  SORT_ORDER.map((ordering) => ({ value: ordering, label: t(SORT_MESSAGES[ordering]) })),
)
</script>

<template>
  <!--
    A grid of rows that are always there, so the toolbar keeps its height whatever is set: on a phone
    status / sorting, on a wider screen status, then sorting at the far end, on one row. "Clear filters"
    takes the free end of the last row and never adds one. The search lives in the header.
  -->
  <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 md:grid-cols-[auto_minmax(min-content,1fr)_minmax(0,auto)]">
    <!-- Below the wide layout the four statuses share the full width; on a phone with tighter segments, so no label breaks in two. -->
    <SegmentedControl
      v-model="view.status"
      :options="statusOptions"
      :label="t('toolbar.statusLabel')"
      class="col-span-2 col-start-1 row-start-1 justify-self-start max-md:w-full md:col-span-1 [&>button]:flex-auto [&>button]:whitespace-nowrap max-sm:[&>button]:px-1.5"
    />

    <!-- The deadline filter rides with the sorting, so it adds no row. -->
    <div
      class="col-start-1 row-start-2 flex max-w-full min-w-0 gap-2 justify-self-start md:col-start-3 md:row-start-1 md:justify-self-end"
    >
      <DeadlineFilter />

      <DropdownMenu :items="sortItems" :checked="view.ordering" @select="view.ordering = $event">
        <template #trigger>
          <!-- A long name is shortened to leave room for "Clear filters"; the accessible name stays whole. -->
          <Button :aria-label="t('toolbar.sortBy', { sort: sortLabel })" class="min-w-0">
            <ArrowUpDown class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
            <span class="truncate">{{ sortLabel }}</span>
          </Button>
        </template>
      </DropdownMenu>
    </div>

    <Button
      v-if="view.isFiltered"
      variant="ghost"
      class="col-start-2 row-start-2 justify-self-end whitespace-nowrap md:row-start-1"
      @click="view.clearFilters()"
    >
      {{ t('toolbar.clearFilters') }}
    </Button>
  </div>
</template>
