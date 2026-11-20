<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { computed, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskRead, TaskStatus } from '../../../api/generated/client'
import { useBoardStore } from '../../../stores/board'
import { useSettingsStore } from '../../../stores/settings'
import { usePriorityChange, useTaskDelete } from '../../../stores/taskActions'
import IconButton from '../../ui/IconButton.vue'
import PriorityMenu from '../PriorityMenu.vue'
import { useFocusOnLeave } from '../focusOnLeave'
import TaskDeadline from '../TaskDeadline.vue'
import TaskDeleteConfirm from '../TaskDeleteConfirm.vue'
import TaskDescription from '../TaskDescription.vue'
import { useTaskDates } from '../taskDisplay'
import TaskStatusMenu from '../TaskStatusMenu.vue'
import TaskTitleButton from '../TaskTitleButton.vue'

const { task } = defineProps<{ task: TaskRead }>()

const emit = defineEmits<{
  dragstart: []
  dragend: []
  /** A status was picked from the card's menu: the keyboard way of dragging it. */
  move: [status: TaskStatus]
  /** Move up or Move down was picked: the keyboard way of dragging it to another place. */
  reorder: [delta: -1 | 1]
}>()

const { t } = useI18n()
const settings = useSettingsStore()
const board = useBoardStore()

const isMoving = computed(() => board.isMoving(task.id))
const { isChangingPriority, priority, changePriority } = usePriorityChange(() => task)
const { isConfirmingDelete, isDeleting, askToDelete, deleteConfirmed } = useTaskDelete(
  () => task,
  () => isMoving.value || isChangingPriority.value,
)
const isBusy = computed(() => isMoving.value || isChangingPriority.value || isDeleting.value)

// The card is named by its title, the text of its edit button; the button's own name says it edits.
const titleId = useId()

const { deadline, isOverdue } = useTaskDates(
  () => task,
  computed(() => task.status),
)

// A drag event of the browser always carries its data transfer. Some browsers start a drag only with data set.
function startDrag(event: DragEvent): void {
  const transfer = event.dataTransfer as DataTransfer
  transfer.setData('text/plain', task.id)
  transfer.effectAllowed = 'move'
  emit('dragstart')
}

useFocusOnLeave(useTemplateRef<HTMLElement>('card'), () => isBusy.value)
</script>

<template>
  <article
    ref="card"
    data-testid="board-card"
    :data-task-id="task.id"
    :draggable="!isBusy"
    :aria-labelledby="titleId"
    class="card flex flex-col rounded-control border border-border bg-surface shadow-raised transition-opacity"
    :class="[
      settings.density === 'compact' ? 'gap-1 p-2' : 'gap-2 p-3',
      isBusy ? 'cursor-progress' : 'cursor-grab active:cursor-grabbing',
      { 'opacity-50': isDeleting },
    ]"
    :aria-busy="isBusy ? 'true' : undefined"
    @dragstart="startDrag"
    @dragend="emit('dragend')"
  >
    <div class="flex items-start gap-2">
      <TaskStatusMenu
        :status="task.status"
        :busy="isMoving"
        :disabled="isBusy"
        :moves="{ up: board.canMoveBy(task, -1), down: board.canMoveBy(task, 1) }"
        @select="emit('move', $event)"
        @reorder="emit('reorder', $event)"
      />
      <TaskTitleButton
        :task="task"
        :done="task.status === 'done'"
        :title-id="titleId"
        class="min-w-0 flex-1 text-sm leading-6 font-medium"
      />
      <IconButton
        :label="t('actions.delete')"
        :aria-disabled="isBusy ? 'true' : undefined"
        class="card-action -my-1 -mr-1.5 size-8! shrink-0 transition-opacity hover:text-danger-text! [&>svg]:size-4!"
        @click="askToDelete"
      >
        <Trash2 aria-hidden="true" />
      </IconButton>
      <TaskDeleteConfirm v-model:open="isConfirmingDelete" :title="task.title" @confirm="deleteConfirmed" />
    </div>
    <TaskDescription :task="task" />
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-text-muted">
      <PriorityMenu :priority="priority" :busy="isChangingPriority" :disabled="isBusy" @select="changePriority" />
      <TaskDeadline v-if="deadline !== null" :deadline="deadline" :overdue="isOverdue" />
    </div>
  </article>
</template>

<style scoped>
/* As on a list row: with a pointer that hovers, the delete button waits for the card to be pointed at or focused. */
@media (hover: hover) and (min-width: 40rem) {
  .card-action {
    opacity: 0;
  }

  .card:hover .card-action,
  .card:focus-within .card-action {
    opacity: 1;
  }
}
</style>
