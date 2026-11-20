<script setup lang="ts">
import { computed, nextTick, provide, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { errorMessageKey } from '../../i18n/errorMessages'
import { formatNumber } from '../../i18n/numbers'
import type { TaskRead } from '../../api/generated/client'
import { useListOrderStore } from '../../stores/listOrder'
import { useListViewStore } from '../../stores/listView'
import { useSettingsStore } from '../../stores/settings'
import { useTasksStore } from '../../stores/tasks'
import Button from '../ui/Button.vue'
import { FOCUS_TASK_LIST } from './listFocus'
import { useListReorder } from './listReorder'
import Pagination from './Pagination.vue'
import TaskMoveMenu from './TaskMoveMenu.vue'
import TaskRow from './TaskRow.vue'

const SKELETON_ROWS = 6

const { t, locale } = useI18n()
const tasks = useTasksStore()
const view = useListViewStore()
const order = useListOrderStore()
const settings = useSettingsStore()

const hasRows = computed(() => tasks.items.length > 0)
const isRequesting = computed(() => tasks.status === 'loading' || tasks.status === 'reloading')

const errorMessage = computed(() => (tasks.error === null ? null : t(errorMessageKey(tasks.error))))

// The number is written for the language; the plural form is still chosen by the count itself.
const totalText = computed(() => t('list.total', { n: formatNumber(tasks.total, locale.value) }, tasks.total))

const emptyText = computed(() => t(view.isFiltered ? 'list.noResults' : 'list.empty'))

// What the live region says. A failure is left to the alert, which would otherwise be announced twice.
// With no rows to keep on screen a reload looks like a first load, and is announced as one.
const announcement = computed(() => {
  if (tasks.status === 'failed') return ''
  if (tasks.status === 'ready') return hasRows.value ? totalText.value : emptyText.value
  return t(hasRows.value ? 'list.reloading' : 'list.loading')
})

// "Try again" stays focusable while it asks, so pressing it again then must do nothing.
function retry(): void {
  if (!isRequesting.value) tasks.retry()
}

// The controls count from the page of the rows on screen. After a page failed to load that is still
// the page before it, so asking for the same page once more is a retry, not a change of the view.
function goToPage(page: number): void {
  if (page !== view.page) view.page = page
  else if (tasks.status === 'failed') tasks.retry()
}

// A leaving row is taken out of the flow, so the rows replacing it do not start below it;
// pinned to where it was, it fades out in place.
function pinInPlace(row: Element): void {
  const element = row as HTMLElement
  element.style.top = `${element.offsetTop}px`
}

// Where the focus goes when the row holding it leaves the list.
const region = useTemplateRef<HTMLElement>('region')
provide(FOCUS_TASK_LIST, () => region.value?.focus({ preventScroll: true }))

// In the custom order each row has a handle to drag it by, which is also its Move up / Move down menu.
const reorder = useListReorder(
  useTemplateRef<HTMLElement>('rows'),
  () => order.items,
  (task, index) => void order.place(task, index),
)

// Put in its new place, the row takes the focus out with it: it goes back to the row's handle.
async function moveByMenu(task: TaskRead, delta: -1 | 1): Promise<void> {
  void order.moveBy(task, delta)
  await nextTick()
  setTimeout(() => {
    region.value
      ?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(task.id)}"] [data-testid="task-move"]`)
      ?.focus()
  }, 0)
}
</script>

<template>
  <section ref="region" tabindex="-1" :aria-label="t('actions.listLabel')" class="outline-none">
    <!-- Always in the page, with only its text changing: a region inserted already filled is not announced. -->
    <p role="status" class="sr-only">{{ announcement }}</p>

    <div
      v-if="errorMessage !== null"
      role="alert"
      class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control bg-danger-soft px-4 py-3"
    >
      <p class="min-w-0 flex-1 basis-60 text-sm text-danger-text">{{ errorMessage }}</p>
      <Button :busy="isRequesting" class="aria-disabled:cursor-progress" @click="retry">{{ t('list.retry') }}</Button>
    </div>

    <template v-if="hasRows">
      <p data-testid="task-total" class="h-5 text-[13px] leading-5 text-text-muted">
        {{ totalText }}
      </p>
      <!-- Another layout of the same rows (the table) takes the place of the list; the states around it stay. -->
      <slot name="rows">
        <ul
          ref="rows"
          class="relative mt-2 divide-y divide-border border-y border-border transition-opacity"
          :class="{ 'opacity-50': tasks.status === 'reloading' }"
          :aria-busy="tasks.status === 'reloading' ? 'true' : undefined"
          @dragover="reorder.over"
          @dragleave="reorder.leave"
          @drop="reorder.drop"
        >
          <TransitionGroup name="task-row" @before-leave="pinInPlace">
            <li
              v-for="task in order.items"
              :key="task.id"
              :data-task-id="task.id"
              :data-drop-line="reorder.line.value?.id === task.id ? reorder.line.value.side : undefined"
              :aria-busy="order.isMoving(task.id) ? 'true' : undefined"
              class="row-item relative flex items-start"
            >
              <span
                v-if="order.isCustomOrder"
                data-testid="row-handle"
                class="reorder-handle -ml-1 flex shrink-0 transition-opacity"
                :class="settings.density === 'compact' ? 'pt-0.5' : 'pt-2'"
              >
                <TaskMoveMenu
                  handle
                  :title="task.title"
                  :can-move-up="order.canMoveBy(task, -1)"
                  :can-move-down="order.canMoveBy(task, 1)"
                  :busy="order.isMoving(task.id)"
                  @move="moveByMenu(task, $event)"
                  @dragstart="reorder.start(task, $event)"
                  @dragend="reorder.end"
                />
              </span>
              <TaskRow :task="task" class="min-w-0 flex-1" />
            </li>
          </TransitionGroup>
        </ul>
      </slot>
      <Pagination :page="tasks.page" :pages="tasks.pages" class="mt-5" @update:page="goToPage" />
    </template>

    <template v-else-if="errorMessage === null">
      <div v-if="tasks.status === 'ready'" data-testid="task-list-empty" class="py-16 text-center">
        <p class="text-sm text-text-muted">{{ emptyText }}</p>
        <Button v-if="view.isFiltered" class="mt-4" @click="view.clearFilters()">
          {{ t('toolbar.clearFilters') }}
        </Button>
      </div>

      <div v-else>
        <div aria-hidden="true" class="animate-pulse">
          <div class="flex h-5 items-center">
            <div class="h-3 w-20 rounded-full bg-surface-muted" />
          </div>
          <div class="mt-2 divide-y divide-border border-y border-border">
            <div v-for="row in SKELETON_ROWS" :key="row" class="flex gap-3 py-3">
              <div class="flex h-6 items-center">
                <div class="size-[18px] rounded-full bg-surface-muted" />
              </div>
              <div class="flex-1">
                <div class="flex h-6 items-center">
                  <div class="h-3.5 w-1/2 rounded-full bg-surface-muted" />
                </div>
                <div class="mt-0.5 flex h-5 items-center">
                  <div class="h-3 w-1/3 rounded-full bg-surface-muted" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.task-row-enter-active,
.task-row-leave-active {
  transition: opacity 150ms ease-out;
}

.task-row-enter-from,
.task-row-leave-to {
  opacity: 0;
}

.task-row-leave-active {
  position: absolute;
  inset-inline: 0;
}

.task-row-move {
  transition: transform 200ms ease-out;
}

/* With a pointer that hovers, the handle waits for its row to be pointed at or focused, as the delete button does. */
@media (hover: hover) and (min-width: 40rem) {
  .reorder-handle {
    opacity: 0;
  }

  .row-item:hover .reorder-handle,
  .row-item:focus-within .reorder-handle {
    opacity: 1;
  }
}

/* The line where a dropped row lands, drawn over the border between two rows, so nothing shifts under the pointer. */
li[data-drop-line]::before {
  content: '';
  position: absolute;
  inset-inline: 0;
  z-index: 1;
  height: 2px;
  border-radius: 9999px;
  background-color: var(--color-accent);
  pointer-events: none;
}

li[data-drop-line='before']::before {
  top: -1.5px;
}

li[data-drop-line='after']::before {
  bottom: -1.5px;
}
</style>
