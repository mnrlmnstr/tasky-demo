<script setup lang="ts">
const checked = defineModel<boolean>({ required: true })

defineProps<{
  /** The visible text next to the switch, which is also its accessible name. */
  label: string
}>()
</script>

<template>
  <!-- A native checkbox: keyboard, form and screen reader behaviour come with it; only the look is drawn. -->
  <label class="inline-flex cursor-pointer items-center gap-3 text-sm text-text select-none">
    <input v-model="checked" type="checkbox" role="switch" class="peer sr-only" />
    <span
      aria-hidden="true"
      class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-border p-0.5 transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-checked:[&>span]:translate-x-4"
    >
      <span class="size-4 rounded-full bg-white shadow-raised transition-transform" />
    </span>
    {{ label }}
  </label>
</template>
