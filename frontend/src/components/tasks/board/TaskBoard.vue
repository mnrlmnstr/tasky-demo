<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskRead, TaskStatus } from '../../../api/generated/client'
import { TASK_STATUSES } from '../../../api/taskStatuses'
import { useBoardStore } from '../../../stores/board'
import { formatNumber } from '../../../i18n/numbers'
import { FOCUS_TASK_LIST } from '../listFocus'
import BoardColumn from './BoardColumn.vue'

const { t, locale } = useI18n()
const board = useBoardStore()

// The board follows the view and the changes made anywhere only while it is on screen.
onMounted(board.start)
onUnmounted(board.stop)

function columnLabel(status: TaskStatus): string {
  const { total } = board.columns[status]
  return t('board.column', { status: t(`task.status.${status}`), n: formatNumber(total, locale.value) }, total)
}

// What the one live region says: that the board loads, then how many tasks each column holds. A failed
// column is left to its own alert, which would otherwise be announced twice.
const announcement = computed(() => {
  const statuses = TASK_STATUSES.map((status) => board.columns[status].status)
  if (statuses.includes('loading')) return t('board.loading')
  if (statuses.includes('reloading')) return t('board.reloading')
  if (statuses.includes('failed')) return ''
  return t('board.counts', { todo: columnLabel('todo'), inProgress: columnLabel('in_progress'), done: columnLabel('done') })
})

const dragged = shallowRef<TaskRead | null>(null)

// A drag reorders: from its start the board shows the custom order, so the card lands where it is dropped.
function startDrag(task: TaskRead): void {
  dragged.value = task
  board.showCustomOrder()
}

function dropOn(status: TaskStatus, index: number): void {
  const card = dragged.value as TaskRead
  dragged.value = null
  void board.place(card, status, index)
}

const region = useTemplateRef<HTMLElement>('region')
provide(FOCUS_TASK_LIST, () => region.value?.focus({ preventScroll: true }))

// Moved by its menu, the card is drawn anew in its new column. The focus follows it there, once the
// closing menu has handed the focus back to the trigger it came from, which is gone.
async function focusCard(task: TaskRead, control: string): Promise<void> {
  await nextTick()
  setTimeout(() => {
    region.value
      ?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(task.id)}"] [data-testid="${control}"]`)
      ?.focus()
  }, 0)
}

function moveByMenu(task: TaskRead, status: TaskStatus): Promise<void> {
  void board.move(task, status)
  return focusCard(task, 'task-status')
}

// Moved up or down, the card is put in its new place, which moves the focus out of it.
function reorderByMenu(task: TaskRead, delta: -1 | 1): Promise<void> {
  void board.moveBy(task, delta)
  return focusCard(task, 'task-status')
}
</script>

<template>
  <section ref="region" tabindex="-1" :aria-label="t('board.label')" class="outline-none">
    <!-- Always in the page, with only its text changing: a region inserted already filled is not announced. -->
    <p role="status" data-testid="board-status" class="sr-only">{{ announcement }}</p>
    <!-- Columns side by side when there is room; otherwise a row that scrolls sideways, a column at a time. -->
    <div
      class="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0"
    >
      <BoardColumn
        v-for="status in TASK_STATUSES"
        :key="status"
        :status="status"
        :column="board.columns[status]"
        :dragged="dragged"
        class="w-[280px] shrink-0 snap-start lg:w-auto"
        @drop="dropOn(status, $event)"
        @retry="board.retry(status)"
        @dragstart="startDrag"
        @dragend="dragged = null"
        @move="moveByMenu"
        @reorder="reorderByMenu"
      />
    </div>
  </section>
</template>
