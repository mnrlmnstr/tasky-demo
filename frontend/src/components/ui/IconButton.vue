<script setup lang="ts">
import { CONTROL_CLASS } from './control'

const { disabled = false } = defineProps<{
  /** Accessible name: the button shows only an icon, so this is what gets announced. */
  label: string
  disabled?: boolean
}>()
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
    class="size-9 rounded-control text-text-muted hover:bg-surface-muted hover:text-text [&>svg]:size-5"
    :class="CONTROL_CLASS"
  >
    <slot />
  </button>
</template>
