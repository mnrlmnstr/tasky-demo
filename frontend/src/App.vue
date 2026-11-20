<script setup lang="ts">
import { Plus, Settings } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SettingsDialog from './components/settings/SettingsDialog.vue'
import TaskFormDialog from './components/tasks/TaskFormDialog.vue'
import TaskBoard from './components/tasks/board/TaskBoard.vue'
import TaskTable from './components/tasks/table/TaskTable.vue'
import TaskList from './components/tasks/TaskList.vue'
import TaskSearch from './components/tasks/TaskSearch.vue'
import TaskToolbar from './components/tasks/TaskToolbar.vue'
import Button from './components/ui/Button.vue'
import IconButton from './components/ui/IconButton.vue'
import UndoToast from './components/undo/UndoToast.vue'
import { useListViewStore } from './stores/listView'
import { useTaskFormStore } from './stores/taskForm'
import { useTasksStore } from './stores/tasks'

const { t } = useI18n()
const settingsOpen = ref(false)
const taskForm = useTaskFormStore()
const view = useListViewStore()

useTasksStore().start()
</script>

<template>
  <!-- From the small breakpoint up the page is a card held off the window's edges; on a phone it runs edge to edge. -->
  <div class="sm:px-6 sm:pb-8">
    <!--
      One width in every view, so switching views moves none of the controls. The top bar shares the card's
      column and lines up with its edges; on a phone, where the card runs edge to edge, it keeps a gutter.
    -->
    <div class="mx-auto max-w-[960px]">
      <header class="flex h-15 items-center justify-between gap-2 px-4 sm:h-18 sm:px-0">
        <h1 class="text-xl font-bold text-text">{{ t('app.title') }}</h1>
        <IconButton :label="t('header.settings')" class="-mr-2 sm:mr-0" @click="settingsOpen = true">
          <Settings aria-hidden="true" />
        </IconButton>
        <SettingsDialog v-model:open="settingsOpen" />
      </header>
      <div
        data-testid="card"
        class="min-h-[calc(100dvh-3.75rem)] border-t border-border bg-surface sm:min-h-[calc(100dvh-6.5rem)] sm:rounded-card sm:border sm:shadow-raised"
      >
        <div data-testid="card-header" class="flex items-center gap-2 border-b border-border px-5 py-4">
          <TaskSearch class="min-w-0 flex-1" />
          <!-- Icon alone on a phone, so the search keeps its room; the label stays as its accessible name. -->
          <Button
            variant="primary"
            :title="t('header.newTask')"
            class="shrink-0 max-sm:w-9 max-sm:px-0"
            @click="taskForm.openCreate()"
          >
            <Plus class="size-4" aria-hidden="true" />
            <span class="max-sm:sr-only">{{ t('header.newTask') }}</span>
          </Button>
          <TaskFormDialog />
        </div>
        <main class="px-5 py-5">
          <TaskToolbar class="mb-4" />
          <TaskBoard v-if="view.view === 'board'" />
          <TaskList v-else>
            <template v-if="view.view === 'table'" #rows><TaskTable /></template>
          </TaskList>
        </main>
      </div>
    </div>
    <UndoToast />
  </div>
</template>
