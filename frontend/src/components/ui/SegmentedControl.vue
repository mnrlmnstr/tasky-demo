<script setup lang="ts" generic="T extends string">
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'

export interface SegmentedControlOption<V extends string = string> {
  value: V
  label: string
}

const { disabled = false, options } = defineProps<{
  modelValue: T
  options: SegmentedControlOption<T>[]
  /** Accessible name of the whole group. */
  label: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: T] }>()

// A single-select toggle group reports "nothing" when the pressed item is pressed again;
// a segmented control always keeps one segment selected, so that is dropped.
function select(value: unknown) {
  const chosen = options.find((option) => option.value === value)
  if (chosen) emit('update:modelValue', chosen.value)
}
</script>

<template>
  <ToggleGroupRoot
    type="single"
    :model-value="modelValue"
    :aria-label="label"
    :disabled="disabled"
    class="inline-flex gap-0.5 rounded-control bg-surface-muted p-0.5"
    @update:model-value="select"
  >
    <ToggleGroupItem
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      class="inline-flex h-8 cursor-pointer items-center justify-center rounded-[6px] px-3 text-sm font-medium text-text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-raised data-[state=on]:text-text data-[state=on]:shadow-raised"
    >
      {{ option.label }}
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>
