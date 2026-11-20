<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskRead, TaskStatus } from '../../../api/generated/client'
import { errorMessageKey } from '../../../i18n/errorMessages'
import { formatNumber } from '../../../i18n/numbers'
import type { BoardColumn } from '../../../stores/board'
import Button from '../../ui/Button.vue'
import { placeAt } from '../../../stores/taskOrder'
import { dropIndexAt, dropLineAt, otherTaskElements } from '../dropIndex'
import BoardCard from './BoardCard.vue'

const SKELETON_CARDS = 3

const { status, column, dragged } = defineProps<{
  status: TaskStatus
  column: BoardColumn
  /** The card being dragged on this board, if any. */
  dragged: TaskRead | null
}>()

const emit = defineEmits<{
  /** The dragged card was dropped at this index of the column, counted without the card itself. */
  drop: [index: number]
  retry: []
  dragstart: [task: TaskRead]
  dragend: []
  move: [task: TaskRead, status: TaskStatus]
  reorder: [task: TaskRead, delta: -1 | 1]
}>()

const { t, locale } = useI18n()

// Marks a column the card would move to; its own column only shows the line.
const isOver = ref(false)
// Where the card would land, counted without it; `null` while it would stay where it is.
const dropIndex = ref<number | null>(null)

const root = useTemplateRef<HTMLElement>('root')

const name = computed(() => t(`task.status.${status}`))
const count = computed(() => formatNumber(column.total, locale.value))
const label = computed(() => t('board.column', { status: name.value, n: count.value }, column.total))
const isRequesting = computed(() => column.status === 'loading' || column.status === 'reloading')
const errorMessage = computed(() => (column.error === null ? null : t(errorMessageKey(column.error))))

// "Try again" stays focusable while it asks, so pressing it again then must do nothing.
function retry(): void {
  if (!isRequesting.value) emit('retry')
}
const shownNote = computed(() =>
  column.total > column.items.length
    ? t('board.shown', { shown: formatNumber(column.items.length, locale.value), total: count.value })
    : null,
)

const others = computed(() => column.items.filter((item) => item.id !== dragged?.id))
const line = computed(() => dropLineAt(others.value, dropIndex.value))

function clearMarks(): void {
  isOver.value = false
  dropIndex.value = null
}

// The card goes before the first other card whose middle is below the pointer. Over its own place it
// would not move, so nothing is offered there.
function onDragOver(event: DragEvent): void {
  if (dragged === null) return
  const index = dropIndexAt(otherTaskElements(root.value as HTMLElement, dragged), event.clientY)
  if (placeAt(column.items, dragged, index) === null) {
    clearMarks()
    return
  }
  event.preventDefault()
  const transfer = event.dataTransfer as DataTransfer
  transfer.dropEffect = 'move'
  isOver.value = dragged.status !== status
  dropIndex.value = index
}

// Moving onto a card inside the column also leaves the column itself; only a real exit clears the mark.
function onDragLeave(event: DragEvent): void {
  const into = event.relatedTarget as Node | null
  if (!(event.currentTarget as HTMLElement).contains(into)) clearMarks()
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  const index = dropIndex.value
  clearMarks()
  if (index !== null) emit('drop', index)
}

// A drag that ends anywhere, dropped or not, leaves no column marked.
watch(
  () => dragged,
  (card) => {
    if (card === null) clearMarks()
  },
)
</script>

<template>
  <section
    ref="root"
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
      <Button :busy="isRequesting" class="aria-disabled:cursor-progress" @click="retry">
        {{ t('board.retry') }}
      </Button>
    </div>

    <!-- Cards slide to their new place when the order changes. -->
    <ul
      class="flex flex-col gap-2 transition-opacity"
      :class="{ 'opacity-50': column.status === 'reloading' }"
      :aria-busy="isRequesting ? 'true' : undefined"
    >
      <TransitionGroup name="card">
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
        <li
          v-for="task in column.items"
          :key="task.id"
          class="relative"
          :data-drop-line="line?.id === task.id ? line.side : undefined"
        >
          <BoardCard
            :task="task"
            @dragstart="emit('dragstart', task)"
            @dragend="emit('dragend')"
            @move="emit('move', task, $event)"
            @reorder="emit('reorder', task, $event)"
          />
        </li>
      </TransitionGroup>
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

<style scoped>
.card-move {
  transition: transform 200ms ease-out;
}

/* The line where a dropped card lands, drawn in the gap between two cards, so nothing shifts under the pointer. */
li[data-drop-line]::before {
  content: '';
  position: absolute;
  inset-inline: 2px;
  z-index: 1;
  height: 2px;
  border-radius: 9999px;
  background-color: var(--color-accent);
  pointer-events: none;
}

li[data-drop-line='before']::before {
  top: -5px;
}

li[data-drop-line='after']::before {
  bottom: -5px;
}
</style>
