<script setup lang="ts">
import { ArrowUpDown, Columns3, FilterX, List, Table } from 'lucide-vue-next'
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskOrdering } from '../../api/generated/client'
import { STATUS_FILTERS, TASK_VIEWS, useListViewStore, type TaskView } from '../../stores/listView'
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

// Only the board, which has no status filter, has room for everything on one row: next to the status
// filter a deadline filter showing its days and "Clear filters" do not fit in the list's width.
const oneRow = computed(() => view.view === 'board')

const VIEW_ICONS: Record<TaskView, Component> = { list: List, board: Columns3, table: Table }

const viewOptions = computed(() =>
  TASK_VIEWS.map((value) => ({ value, label: t(`views.${value}`), icon: VIEW_ICONS[value] })),
)

const sortLabel = computed(() => t(SORT_MESSAGES[view.ordering]))
const sortName = computed(() => t('toolbar.sortBy', { sort: sortLabel.value }))

const sortItems = computed(() =>
  SORT_ORDER.map((ordering) => ({ value: ordering, label: t(SORT_MESSAGES[ordering]) })),
)
</script>

<template>
  <!--
    A grid of rows that are always there, so the toolbar keeps its height whatever is set: status /
    sorting, and on the board on a wider screen the sorting alone at the far end of one row. "Clear filters"
    takes the free end of the last row and never adds one: on a phone it is an icon, and the days of the
    deadline filter give way to it. The search lives in the header.
  -->
  <div
    class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
    :class="{ 'md:grid-cols-[auto_minmax(min-content,1fr)_minmax(0,auto)]': oneRow }"
  >
    <!-- Below the wide layout the four statuses share the full width; on a phone with tighter segments, so no label breaks in two. -->
    <!-- The board's columns are the statuses, so it has no status filter. -->
    <SegmentedControl
      v-if="view.view !== 'board'"
      v-model="view.status"
      :options="statusOptions"
      :label="t('toolbar.statusLabel')"
      class="col-span-2 col-start-1 row-start-1 justify-self-start max-md:w-full [&>button]:flex-auto [&>button]:whitespace-nowrap max-sm:[&>button]:px-1.5"
    />

    <!-- The deadline filter and the view switch ride with the sorting, so they add no row. -->
    <div
      class="col-start-1 row-start-2 flex max-w-full min-w-0 gap-1.5 justify-self-start sm:gap-2"
      :class="{ 'md:col-start-3 md:row-start-1 md:justify-self-end': oneRow }"
    >
      <DeadlineFilter />

      <DropdownMenu :items="sortItems" :checked="view.ordering" @select="view.ordering = $event">
        <template #trigger>
          <!--
            A long name is shortened to leave room for "Clear filters"; on a phone, next to the deadline filter,
            only the icon is shown, like the deadline filter does while empty. The accessible name and the
            tooltip always carry the whole name.
          -->
          <Button :aria-label="sortName" :title="sortName" class="min-w-0 max-sm:w-9 max-sm:shrink-0 max-sm:px-0">
            <ArrowUpDown class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
            <span class="truncate max-sm:hidden">{{ sortLabel }}</span>
          </Button>
        </template>
      </DropdownMenu>

      <SegmentedControl v-model="view.view" :options="viewOptions" :label="t('views.label')" class="shrink-0" />
    </div>

    <!-- Icon alone on a phone, where the row has no room for the words; they stay its accessible name. -->
    <Button
      v-if="view.isFiltered"
      variant="ghost"
      :title="t('toolbar.clearFilters')"
      class="col-start-2 row-start-2 justify-self-end whitespace-nowrap max-sm:w-9 max-sm:px-0"
      :class="{ 'md:row-start-1': oneRow }"
      @click="view.clearFilters()"
    >
      <FilterX class="size-4 sm:hidden" aria-hidden="true" />
      <span class="max-sm:sr-only">{{ t('toolbar.clearFilters') }}</span>
    </Button>
  </div>
</template>
