<script setup lang="ts">
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
    class="inline-flex size-9 cursor-pointer items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:size-5"
  >
    <slot />
  </button>
</template>
