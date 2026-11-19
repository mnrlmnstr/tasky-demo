<script setup lang="ts" generic="T extends string">
import { Check } from 'lucide-vue-next'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import type { Component } from 'vue'

export interface DropdownMenuItemOption<V extends string = string> {
  value: V
  label: string
  icon?: Component
  disabled?: boolean
}

const ITEM_CLASS =
  'flex h-8 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-sm text-text outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted'

const ICON_CLASS = 'size-4 shrink-0 text-text-muted'

defineProps<{
  items: DropdownMenuItemOption<T>[]
  /** Makes the menu radio-style: the item with this value is shown as the current choice. */
  checked?: T | ''
}>()

const emit = defineEmits<{ select: [value: T] }>()
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="start"
        :side-offset="4"
        class="z-50 min-w-44 origin-(--reka-dropdown-menu-content-transform-origin) rounded-control border border-border bg-surface p-1 shadow-overlay focus:outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
      >
        <!-- The owner holds the checked value: a choice is only reported, never applied here. -->
        <DropdownMenuRadioGroup v-if="checked !== undefined" :model-value="checked">
          <DropdownMenuRadioItem
            v-for="item in items"
            :key="item.value"
            :value="item.value"
            :disabled="item.disabled"
            :class="ITEM_CLASS"
            @select="emit('select', item.value)"
          >
            <component :is="item.icon" v-if="item.icon" :class="ICON_CLASS" aria-hidden="true" />
            <span class="flex-1">{{ item.label }}</span>
            <DropdownMenuItemIndicator>
              <Check class="size-4 text-accent-text" aria-hidden="true" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <template v-else>
          <DropdownMenuItem
            v-for="item in items"
            :key="item.value"
            :disabled="item.disabled"
            :class="ITEM_CLASS"
            @select="emit('select', item.value)"
          >
            <component :is="item.icon" v-if="item.icon" :class="ICON_CLASS" aria-hidden="true" />
            <span class="flex-1">{{ item.label }}</span>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
