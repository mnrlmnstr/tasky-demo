<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { TaskRead } from '../../api/generated/client'
import { useTaskFormStore } from '../../stores/taskForm'
import { FOCUS_RING_CLASS } from '../ui/control'

/**
 * A task's title, as the button that opens it for editing, on a list row, a board card or a table row.
 * Its size comes from the `class` given to it.
 */
const { task, done = false, titleId } = defineProps<{
  task: TaskRead
  /** Muted, as a done task is. */
  done?: boolean
  /** An id for the title text, for an element named by the title alone. */
  // eslint-disable-next-line vue/require-default-prop -- left out (undefined) means the title text needs no id
  titleId?: string
}>()

const { t } = useI18n()
</script>

<template>
  <p data-testid="task-title" class="wrap-anywhere" :class="{ 'text-text-muted': done }">
    <button
      type="button"
      :aria-label="t('form.editTask', { title: task.title })"
      class="cursor-pointer rounded-item text-left decoration-text-muted underline-offset-4 hover:underline"
      :class="FOCUS_RING_CLASS"
      @click="useTaskFormStore().openEdit(task)"
    >
      <span v-if="titleId !== undefined" :id="titleId">{{ task.title }}</span>
      <template v-else>{{ task.title }}</template>
    </button>
  </p>
</template>
