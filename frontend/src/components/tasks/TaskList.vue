<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useListViewStore } from '../../stores/listView'
import { useTasksStore } from '../../stores/tasks'
import Button from '../ui/Button.vue'
import Pagination from './Pagination.vue'
import TaskRow from './TaskRow.vue'

const SKELETON_ROWS = 6

const { t, te } = useI18n()
const tasks = useTasksStore()
const view = useListViewStore()

const hasRows = computed(() => tasks.items.length > 0)
const isRequesting = computed(() => tasks.status === 'loading' || tasks.status === 'reloading')

const errorMessage = computed(() => {
  if (tasks.error === null) return null
  const key = `errors.${tasks.error}`
  return te(key) ? t(key) : t('errors.generic')
})

// A leaving row is taken out of the flow, so the rows replacing it do not start below it;
// pinned to where it was, it fades out in place.
function pinInPlace(row: Element): void {
  const element = row as HTMLElement
  element.style.top = `${element.offsetTop}px`
}
</script>

<template>
  <section>
    <div
      v-if="errorMessage !== null"
      role="alert"
      class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control bg-danger-soft px-4 py-3"
    >
      <p class="min-w-0 flex-1 basis-60 text-sm text-danger-text">{{ errorMessage }}</p>
      <Button :loading="isRequesting" @click="tasks.retry()">{{ t('list.retry') }}</Button>
    </div>

    <template v-if="hasRows">
      <p data-testid="task-total" class="h-5 text-[13px] leading-5 text-text-muted">
        {{ t('list.total', tasks.total) }}
      </p>
      <ul
        class="relative mt-2 divide-y divide-border border-y border-border transition-opacity"
        :class="{ 'opacity-50': tasks.status === 'reloading' }"
        :aria-busy="tasks.status === 'reloading' ? 'true' : undefined"
      >
        <TransitionGroup name="task-row" @before-leave="pinInPlace">
          <li v-for="task in tasks.items" :key="task.id">
            <TaskRow :task="task" />
          </li>
        </TransitionGroup>
      </ul>
      <Pagination v-model:page="view.page" :pages="tasks.pages" class="mt-5" />
    </template>

    <template v-else-if="errorMessage === null">
      <div v-if="tasks.status === 'ready'" data-testid="task-list-empty" class="py-16 text-center">
        <template v-if="view.isFiltered">
          <p class="text-sm text-text-muted">{{ t('list.noResults') }}</p>
          <Button class="mt-4" @click="view.clearFilters()">{{ t('toolbar.clearFilters') }}</Button>
        </template>
        <p v-else class="text-sm text-text-muted">{{ t('list.empty') }}</p>
      </div>

      <div v-else>
        <p role="status" class="sr-only">{{ t('list.loading') }}</p>
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
</style>
