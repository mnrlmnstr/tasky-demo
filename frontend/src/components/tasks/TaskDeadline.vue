<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

/**
 * A task's deadline as written by `useTaskDates`, a dash for none, and the overdue mark: in words on a list
 * row or a board card, as an icon in the table.
 */
const { deadline, overdue, icon = false } = defineProps<{
  deadline: string | null
  overdue: boolean
  /** The table keeps its columns narrow: an icon marks it, the words are for screen readers and the tooltip. */
  icon?: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <span
    data-testid="task-deadline"
    :class="[{ 'text-danger-text': overdue }, { 'inline-flex items-center gap-1': icon }]"
    :title="icon && overdue ? t('task.overdue') : undefined"
  >
    <template v-if="deadline === null">
      <span aria-hidden="true">—</span>
      <span class="sr-only">{{ t('task.noDeadline') }}</span>
    </template>
    <template v-else-if="icon">
      {{ deadline }}
      <template v-if="overdue">
        <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="sr-only"> · {{ t('task.overdue') }}</span>
      </template>
    </template>
    <template v-else>
      {{ t(overdue ? 'task.dueOverdue' : 'task.due', { date: deadline }) }}
    </template>
  </span>
</template>
