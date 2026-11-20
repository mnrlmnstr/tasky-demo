<script setup lang="ts">
import { ArrowDown, ArrowUp } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskOrdering } from '../../../api/generated/client'
import { useListViewStore } from '../../../stores/listView'
import { useTasksStore } from '../../../stores/tasks'
import { FOCUS_RING_CLASS } from '../../ui/control'
import TaskTableRow from './TaskTableRow.vue'

type SortColumn = 'deadline' | 'created'

// Each sortable column with its two orderings, the one a first press picks coming first: the soonest
// deadline, the newest task. They are the orderings of the sort menu.
const ORDERINGS: Record<SortColumn, [TaskOrdering, TaskOrdering]> = {
  deadline: ['deadline', '-deadline'],
  created: ['-created_at', 'created_at'],
}

const { t } = useI18n()
const tasks = useTasksStore()
const view = useListViewStore()

function sortBy(column: SortColumn): void {
  const [first, second] = ORDERINGS[column]
  view.ordering = view.ordering === first ? second : first
}

function direction(column: SortColumn): 'ascending' | 'descending' | undefined {
  if (!ORDERINGS[column].includes(view.ordering)) return undefined
  return view.ordering.startsWith('-') ? 'descending' : 'ascending'
}

const sortable = computed(() =>
  (['deadline', 'created'] as const).map((column) => ({
    column,
    name: t(`table.${column}`),
    direction: direction(column),
  })),
)

const HEADER_CLASS = 'py-2 pr-4 text-left text-xs font-medium whitespace-nowrap text-text-muted'
</script>

<template>
  <!-- Scrolls sideways inside the page on a narrow screen, instead of squeezing the columns. -->
  <div class="-mx-5 mt-2 overflow-x-auto px-5">
    <table
      class="w-full min-w-[600px] border-collapse text-sm transition-opacity"
      :class="{ 'opacity-50': tasks.status === 'reloading' }"
      :aria-busy="tasks.status === 'reloading' ? 'true' : undefined"
    >
      <thead class="border-b border-border">
        <tr>
          <th scope="col" :class="HEADER_CLASS" class="w-10 pl-1">
            <span class="sr-only">{{ t('table.status') }}</span>
          </th>
          <th scope="col" :class="HEADER_CLASS">{{ t('table.title') }}</th>
          <th scope="col" :class="HEADER_CLASS">{{ t('table.priority') }}</th>
          <th
            v-for="header in sortable"
            :key="header.column"
            scope="col"
            :aria-sort="header.direction"
            :class="HEADER_CLASS"
          >
            <button
              type="button"
              :title="t('table.sortBy', { column: header.name })"
              class="-mx-1 inline-flex cursor-pointer items-center gap-1 rounded-item px-1 hover:text-text"
              :class="[FOCUS_RING_CLASS, { 'text-text': header.direction }]"
              @click="sortBy(header.column)"
            >
              {{ header.name }}
              <ArrowUp v-if="header.direction === 'ascending'" class="size-3.5" aria-hidden="true" />
              <ArrowDown v-else-if="header.direction === 'descending'" class="size-3.5" aria-hidden="true" />
            </button>
          </th>
          <th scope="col" :class="HEADER_CLASS" class="w-10">
            <span class="sr-only">{{ t('table.actions') }}</span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border border-b border-border">
        <TaskTableRow v-for="task in tasks.items" :key="task.id" :task="task" />
      </tbody>
    </table>
  </div>
</template>
