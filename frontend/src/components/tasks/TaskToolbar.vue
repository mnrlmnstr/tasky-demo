<script setup lang="ts">
import { ArrowUpDown, Columns3, FilterX, List, Table } from 'lucide-vue-next'
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskOrdering } from '../../api/generated/client'
import { TASK_STATUSES } from '../../api/taskStatuses'
import { formatNumber } from '../../i18n/numbers'
import { useBoardStore } from '../../stores/board'
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

const { t, locale } = useI18n()
const view = useListViewStore()

const statusOptions = computed(() =>
  STATUS_FILTERS.map((status) => ({
    value: status,
    label: status === 'all' ? t('toolbar.statusAll') : t(`task.status.${status}`),
  })),
)

const board = useBoardStore()

// On the board, whose columns are the statuses, the start of the toolbar says how many tasks it holds,
// once every column has answered.
const boardTotal = computed(() => {
  const columns = TASK_STATUSES.map((status) => board.columns[status])
  if (columns.some((column) => column.status === 'loading' || column.status === 'failed')) return ''
  const total = columns.reduce((sum, column) => sum + column.total, 0)
  return t('list.total', { n: formatNumber(total, locale.value) }, total)
})

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
    The same two parts in every view: the start (the status filter, or the board's count) and the end
    (Clear filters, deadline, sorting, view switch, in that order and pressed to the right edge). From the
    large breakpoint they share one row; below it they are two rows that are always there. The end grows
    to the left only, so "Clear filters" or the days of a deadline filter never move the sorting or the
    view switch, and the toolbar keeps its height whatever is set. The search lives in the card header.
  -->
  <div data-testid="toolbar" class="grid grid-cols-1 items-center gap-2 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-4">
    <div data-testid="toolbar-start" class="flex h-9 min-w-0 items-center">
      <!-- Below the one-row layout the four statuses share the full width; on a phone with tighter segments. -->
      <SegmentedControl
        v-if="view.view !== 'board'"
        v-model="view.status"
        :options="statusOptions"
        :label="t('toolbar.statusLabel')"
        class="max-lg:w-full [&>button]:flex-auto [&>button]:whitespace-nowrap max-sm:[&>button]:px-1.5"
      />
      <!-- The board's columns are the statuses, so it has no status filter: its count takes the place. -->
      <p v-else data-testid="board-total" class="text-[13px] leading-5 text-text-muted">{{ boardTotal }}</p>
    </div>

    <div data-testid="toolbar-end" class="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
      <!-- Icon alone on a phone, where the row has no room for the words; they stay its accessible name. -->
      <Button
        v-if="view.isFiltered"
        variant="ghost"
        :title="t('toolbar.clearFilters')"
        class="shrink-0 whitespace-nowrap max-sm:w-9 max-sm:px-0"
        @click="view.clearFilters()"
      >
        <FilterX class="size-4 sm:hidden" aria-hidden="true" />
        <span class="max-sm:sr-only">{{ t('toolbar.clearFilters') }}</span>
      </Button>

      <DeadlineFilter />

      <DropdownMenu :items="sortItems" :checked="view.ordering" @select="view.ordering = $event">
        <template #trigger>
          <!--
            The sorting is what gives way on a full row: its name is shortened, and on a phone only the icon
            is shown, like the deadline filter while empty. The accessible name and the tooltip always carry
            the whole name.
          -->
          <Button :aria-label="sortName" :title="sortName" class="min-w-0 max-sm:w-9 max-sm:shrink-0 max-sm:px-0">
            <ArrowUpDown class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
            <span class="truncate max-sm:hidden">{{ sortLabel }}</span>
          </Button>
        </template>
      </DropdownMenu>

      <SegmentedControl v-model="view.view" :options="viewOptions" :label="t('views.label')" class="shrink-0" />
    </div>
  </div>
</template>

