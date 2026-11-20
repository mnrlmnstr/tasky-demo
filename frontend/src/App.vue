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
  <div class="sm:px-6 sm:py-8">
    <!-- The board needs room for three columns side by side; the list and the table read better narrow. -->
    <div
      class="mx-auto min-h-dvh border-border bg-surface sm:min-h-[calc(100dvh-4rem)] sm:rounded-card sm:border sm:shadow-raised"
      :class="view.view === 'board' ? 'max-w-[1100px]' : 'max-w-[760px]'"
    >
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <!-- The app's name stays the page heading for assistive technology; the search takes its place on screen. -->
        <h1 class="sr-only">{{ t('app.title') }}</h1>
        <TaskSearch class="min-w-0 flex-1" />
        <IconButton :label="t('header.settings')" @click="settingsOpen = true">
          <Settings aria-hidden="true" />
        </IconButton>
        <SettingsDialog v-model:open="settingsOpen" />
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
      </header>
      <main class="px-5 py-5">
        <TaskToolbar class="mb-4" />
        <TaskBoard v-if="view.view === 'board'" />
        <TaskList v-else>
          <template v-if="view.view === 'table'" #rows><TaskTable /></template>
        </TaskList>
      </main>
    </div>
    <UndoToast />
  </div>
</template>
