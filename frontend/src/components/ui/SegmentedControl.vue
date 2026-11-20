<script setup lang="ts" generic="T extends string">
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'
import type { Component } from 'vue'

import { CONTROL_CLASS } from './control'

export interface SegmentedControlOption<V extends string = string> {
  value: V
  label: string
  /** Shown in place of the label, which then names the segment for screen readers and in a tooltip. */
  icon?: Component
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
      :aria-label="option.icon ? option.label : undefined"
      :title="option.icon ? option.label : undefined"
      class="h-8 rounded-item px-3 text-sm font-medium text-text-muted hover:text-text data-[state=on]:bg-raised data-[state=on]:text-text data-[state=on]:shadow-raised"
      :class="[CONTROL_CLASS, { 'px-2!': option.icon }]"
    >
      <component :is="option.icon" v-if="option.icon" class="size-4" aria-hidden="true" />
      <template v-else>{{ option.label }}</template>
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>
