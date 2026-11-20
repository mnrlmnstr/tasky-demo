<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskRead, TaskStatus } from '../../../api/generated/client'
import { useBoardStore } from '../../../stores/board'
import { useSettingsStore } from '../../../stores/settings'
import { useTaskFormStore } from '../../../stores/taskForm'
import Badge from '../../ui/Badge.vue'
import { FOCUS_RING_CLASS } from '../../ui/control'
import IconButton from '../../ui/IconButton.vue'
import { useFocusOnLeave, useTaskDelete } from '../taskActions'
import TaskDeleteConfirm from '../TaskDeleteConfirm.vue'
import { PRIORITY_TONES, useTaskDates } from '../taskDisplay'
import TaskStatusMenu from '../TaskStatusMenu.vue'

const { task } = defineProps<{ task: TaskRead }>()

const emit = defineEmits<{
  dragstart: []
  dragend: []
  /** A status was picked from the card's menu: the keyboard way of dragging it. */
  move: [status: TaskStatus]
}>()

const { t } = useI18n()
const settings = useSettingsStore()
const board = useBoardStore()

const isMoving = computed(() => board.isMoving(task.id))
const { isConfirmingDelete, isDeleting, askToDelete, deleteConfirmed } = useTaskDelete(
  () => task,
  () => isMoving.value,
)
const isBusy = computed(() => isMoving.value || isDeleting.value)

const { deadline, isOverdue } = useTaskDates(
  () => task,
  computed(() => task.status),
)

const description = computed(() =>
  settings.showDescriptions && task.description?.trim() ? task.description : null,
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
    draggable="true"
    class="card flex cursor-grab flex-col rounded-control border border-border bg-surface shadow-raised transition-opacity active:cursor-grabbing"
    :class="[settings.density === 'compact' ? 'gap-1 p-2' : 'gap-2 p-3', { 'opacity-50': isDeleting }]"
    :aria-busy="isBusy ? 'true' : undefined"
    @dragstart="startDrag"
    @dragend="emit('dragend')"
  >
    <div class="flex items-start gap-2">
      <TaskStatusMenu
        :status="task.status"
        :busy="isMoving"
        :disabled="isBusy"
        @select="emit('move', $event)"
      />
      <p
        data-testid="task-title"
        class="min-w-0 flex-1 text-sm leading-6 font-medium wrap-anywhere"
        :class="{ 'text-text-muted': task.status === 'done' }"
      >
        <button
          type="button"
          :aria-label="t('form.editTask', { title: task.title })"
          class="cursor-pointer rounded-item text-left decoration-text-muted underline-offset-4 hover:underline"
          :class="FOCUS_RING_CLASS"
          @click="useTaskFormStore().openEdit(task)"
        >
          {{ task.title }}
        </button>
      </p>
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
    <p
      v-if="description !== null"
      data-testid="task-description"
      class="truncate text-[13px] leading-5 text-text-muted"
    >
      {{ description }}
    </p>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-text-muted">
      <Badge :tone="PRIORITY_TONES[task.priority]">{{ t(`task.priority.${task.priority}`) }}</Badge>
      <span v-if="deadline !== null" data-testid="task-deadline" :class="{ 'text-danger-text': isOverdue }">
        {{ t('task.due', { date: deadline }) }}
        <template v-if="isOverdue"> · {{ t('task.overdue') }}</template>
      </span>
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
