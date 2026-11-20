<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskRead } from '../../api/generated/client'
import { useSettingsStore } from '../../stores/settings'
import { usePriorityChange, useStatusChange, useTaskDelete } from '../../stores/taskActions'
import { useTaskFormStore } from '../../stores/taskForm'
import { FOCUS_RING_CLASS } from '../ui/control'
import IconButton from '../ui/IconButton.vue'
import PriorityMenu from './PriorityMenu.vue'
import { useFocusOnLeave } from './focusOnLeave'
import TaskDeleteConfirm from './TaskDeleteConfirm.vue'
import { useTaskDates } from './taskDisplay'
import TaskStatusMenu from './TaskStatusMenu.vue'

const { task } = defineProps<{ task: TaskRead }>()

const { t } = useI18n()
const settings = useSettingsStore()

const { pickedStatus, isChangingStatus, status, changeStatus } = useStatusChange(() => task)
const { pickedPriority, isChangingPriority, priority, changePriority } = usePriorityChange(() => task)
const { isConfirmingDelete, isDeleting, askToDelete, deleteConfirmed } = useTaskDelete(
  () => task,
  () => isChangingStatus.value || isChangingPriority.value,
)

// One request per row at a time: the controls stay focusable meanwhile, but do nothing.
const isBusy = computed(() => isChangingStatus.value || isChangingPriority.value || isDeleting.value)
const isDone = computed(() => status.value === 'done')

const { deadline, isOverdue, createdAgo, createdAt } = useTaskDates(() => task, status)

const description = computed(() =>
  settings.showDescriptions && task.description?.trim() ? task.description : null,
)

useFocusOnLeave(useTemplateRef<HTMLElement>('row'), () => isDeleting.value || pickedStatus.value !== null || pickedPriority.value !== null)
</script>

<template>
  <div
    ref="row"
    class="row flex gap-3 transition-opacity"
    :class="[settings.density === 'compact' ? 'py-1.5' : 'py-3', { 'opacity-50': isDeleting }]"
    :aria-busy="isDeleting ? 'true' : undefined"
  >
    <TaskStatusMenu :status="status" :busy="isChangingStatus" :disabled="isBusy" @select="changeStatus" />
    <div class="min-w-0 flex-1">
      <div class="flex items-start gap-3">
        <p
          data-testid="task-title"
          class="min-w-0 flex-1 text-[15px] leading-6 font-medium wrap-anywhere"
          :class="{ 'text-text-muted': isDone }"
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
        <PriorityMenu
          :priority="priority"
          :busy="isChangingPriority"
          :disabled="isBusy"
          class="mt-0.5"
          @select="changePriority"
        />
        <IconButton
          :label="t('actions.delete')"
          :aria-disabled="isBusy ? 'true' : undefined"
          class="row-action -my-1 -mr-1.5 size-8! shrink-0 transition-opacity hover:text-danger-text! [&>svg]:size-4!"
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
      <p class="mt-0.5 flex flex-wrap gap-x-4 text-[13px] leading-5 text-text-muted">
        <span data-testid="task-deadline" :class="{ 'text-danger-text': isOverdue }">
          <template v-if="deadline === null">
            <span aria-hidden="true">—</span>
            <span class="sr-only">{{ t('task.noDeadline') }}</span>
          </template>
          <template v-else>
            {{ t(isOverdue ? 'task.dueOverdue' : 'task.due', { date: deadline }) }}
          </template>
        </span>
        <span>
          <time :datetime="task.created_at" :title="createdAt">
            {{ t('task.created', { date: createdAgo }) }}
          </time>
          <!-- The tooltip needs a pointer; this says the same to a screen reader. -->
          <span data-testid="task-created-at" class="sr-only">{{ createdAt }}</span>
        </span>
      </p>
    </div>
  </div>
</template>

<style scoped>
/* With a pointer that hovers and room to aim, the delete button waits for the row to be pointed at or focused. */
@media (hover: hover) and (min-width: 40rem) {
  .row-action {
    opacity: 0;
  }

  .row:hover .row-action,
  .row:focus-within .row-action {
    opacity: 1;
  }
}
</style>
