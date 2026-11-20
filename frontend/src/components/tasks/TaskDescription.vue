<script setup lang="ts">
import { computed } from 'vue'

import type { TaskRead } from '../../api/generated/client'
import { useSettingsStore } from '../../stores/settings'

/** A task's description on one line, under its title, when the settings show descriptions and it has one. */
const { task } = defineProps<{ task: TaskRead }>()

const settings = useSettingsStore()

const description = computed(() =>
  settings.showDescriptions && task.description?.trim() ? task.description : null,
)
</script>

<template>
  <p
    v-if="description !== null"
    data-testid="task-description"
    class="truncate text-[13px] leading-5 text-text-muted"
  >
    {{ description }}
  </p>
</template>
