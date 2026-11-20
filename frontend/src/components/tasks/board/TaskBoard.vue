<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, provide, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskRead, TaskStatus } from '../../../api/generated/client'
import { useBoardStore } from '../../../stores/board'
import { FOCUS_TASK_LIST } from '../listFocus'
import { STATUS_ORDER } from '../taskDisplay'
import BoardColumn from './BoardColumn.vue'

const { t } = useI18n()
const board = useBoardStore()

// The board follows the view and the changes made anywhere only while it is on screen.
onMounted(board.start)
onUnmounted(board.stop)

const dragged = shallowRef<TaskRead | null>(null)

function dropOn(status: TaskStatus): void {
  const card = dragged.value as TaskRead
  dragged.value = null
  void board.move(card, status)
}

const region = useTemplateRef<HTMLElement>('region')
provide(FOCUS_TASK_LIST, () => region.value?.focus({ preventScroll: true }))

// Moved by its menu, the card is drawn anew in its new column. The focus follows it there, once the
// closing menu has handed the focus back to the trigger it came from, which is gone.
async function moveByMenu(task: TaskRead, status: TaskStatus): Promise<void> {
  void board.move(task, status)
  await nextTick()
  setTimeout(() => {
    region.value
      ?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(task.id)}"] [data-testid="task-status"]`)
      ?.focus()
  }, 0)
}
</script>

<template>
  <section ref="region" tabindex="-1" :aria-label="t('board.label')" class="outline-none">
    <!-- Columns side by side when there is room; otherwise a row that scrolls sideways, a column at a time. -->
    <div
      class="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0"
    >
      <BoardColumn
        v-for="status in STATUS_ORDER"
        :key="status"
        :status="status"
        :column="board.columns[status]"
        :dragged="dragged"
        class="w-[280px] shrink-0 snap-start lg:w-auto"
        @drop="dropOn(status)"
        @retry="board.retry(status)"
        @dragstart="dragged = $event"
        @dragend="dragged = null"
        @move="moveByMenu"
      />
    </div>
  </section>
</template>
