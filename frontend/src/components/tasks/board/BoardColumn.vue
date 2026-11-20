<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskRead, TaskStatus } from '../../../api/generated/client'
import type { ApiErrorKind } from '../../../api/http'
import { formatNumber } from '../../../i18n/numbers'
import type { BoardColumn } from '../../../stores/board'
import Button from '../../ui/Button.vue'
import BoardCard from './BoardCard.vue'

const SKELETON_CARDS = 3

// Every kind is listed, so a new one does not compile until it has a message.
const ERROR_MESSAGES: Record<ApiErrorKind, string> = {
  network: 'errors.network',
  server: 'errors.server',
  not_found: 'errors.not_found',
  validation: 'errors.generic',
  aborted: 'errors.generic',
}

const { status, column, dragged } = defineProps<{
  status: TaskStatus
  column: BoardColumn
  /** The card being dragged on this board, if any. */
  dragged: TaskRead | null
}>()

const emit = defineEmits<{
  drop: []
  retry: []
  dragstart: [task: TaskRead]
  dragend: []
  move: [task: TaskRead, status: TaskStatus]
}>()

const { t, locale } = useI18n()

const isOver = ref(false)

// A card can only be dropped on a column other than its own.
const accepts = computed(() => dragged !== null && dragged.status !== status)

const name = computed(() => t(`task.status.${status}`))
const count = computed(() => formatNumber(column.total, locale.value))
const label = computed(() => t('board.column', { status: name.value, n: count.value }, column.total))
const isRequesting = computed(() => column.status === 'loading' || column.status === 'reloading')
const errorMessage = computed(() => (column.error === null ? null : t(ERROR_MESSAGES[column.error])))
const shownNote = computed(() =>
  column.total > column.items.length
    ? t('board.shown', { shown: formatNumber(column.items.length, locale.value), total: count.value })
    : null,
)

function onDragOver(event: DragEvent): void {
  if (!accepts.value) return
  event.preventDefault()
  const transfer = event.dataTransfer as DataTransfer
  transfer.dropEffect = 'move'
  isOver.value = true
}

// Moving onto a card inside the column also leaves the column itself; only a real exit clears the mark.
function onDragLeave(event: DragEvent): void {
  const into = event.relatedTarget as Node | null
  if (!(event.currentTarget as HTMLElement).contains(into)) isOver.value = false
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  isOver.value = false
  if (accepts.value) emit('drop')
}

// A drag that ends anywhere, dropped or not, leaves no column marked.
watch(
  () => dragged,
  (card) => {
    if (card === null) isOver.value = false
  },
)
</script>

<template>
  <section
    data-testid="board-column"
    :data-status="status"
    :data-drop-target="isOver ? 'true' : undefined"
    :aria-label="label"
    class="flex min-h-40 flex-col rounded-card bg-surface-muted p-2 transition-colors data-drop-target:bg-accent-soft data-drop-target:outline-2 data-drop-target:-outline-offset-2 data-drop-target:outline-accent"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <h2 class="flex items-center gap-2 px-1.5 pt-1 pb-2 text-[13px] font-semibold text-text">
      {{ name }}
      <span class="text-text-muted tabular-nums">{{ count }}</span>
    </h2>

    <div
      v-if="errorMessage !== null"
      role="alert"
      class="mb-2 flex flex-col items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5"
    >
      <p class="text-[13px] text-danger-text">{{ errorMessage }}</p>
      <Button :loading="isRequesting" @click="emit('retry')">{{ t('board.retry') }}</Button>
    </div>

    <ul
      class="flex flex-col gap-2 transition-opacity"
      :class="{ 'opacity-50': column.status === 'reloading' }"
      :aria-busy="isRequesting ? 'true' : undefined"
    >
      <template v-if="column.status === 'loading' && errorMessage === null">
        <li
          v-for="placeholder in SKELETON_CARDS"
          :key="placeholder"
          data-testid="board-column-loading"
          aria-hidden="true"
          class="animate-pulse rounded-control border border-border bg-surface p-3"
        >
          <div class="h-3.5 w-3/4 rounded-full bg-surface-muted" />
          <div class="mt-3 h-3 w-1/3 rounded-full bg-surface-muted" />
        </li>
      </template>
      <li v-for="task in column.items" :key="task.id">
        <BoardCard
          :task="task"
          @dragstart="emit('dragstart', task)"
          @dragend="emit('dragend')"
          @move="emit('move', task, $event)"
        />
      </li>
    </ul>

    <p
      v-if="column.status === 'ready' && column.items.length === 0"
      data-testid="board-column-empty"
      class="px-1.5 py-6 text-center text-[13px] text-text-muted"
    >
      {{ t('board.empty') }}
    </p>
    <p v-if="shownNote !== null" data-testid="board-column-more" class="px-1.5 pt-2 text-xs text-text-muted">
      {{ shownNote }}
    </p>
  </section>
</template>
