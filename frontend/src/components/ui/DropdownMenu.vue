<script setup lang="ts" generic="T extends string">
import { Check } from 'lucide-vue-next'
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed, type Component } from 'vue'

export interface DropdownMenuItemOption<V extends string = string> {
  value: V
  label: string
  icon?: Component
  disabled?: boolean
}

// Hover and keyboard both highlight an item; the inset ring marks the one reached by keyboard.
const ITEM_CLASS =
  'flex h-8 cursor-pointer items-center gap-2 rounded-item px-2 text-sm text-text outline-none select-none focus-visible:inset-ring-2 focus-visible:inset-ring-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted'

const ICON_CLASS = 'size-4 shrink-0 text-text-muted'

const { checked, actions = [] } = defineProps<{
  items: DropdownMenuItemOption<T>[]
  /**
   * Makes the menu radio-style: the item with this value is shown as the current choice,
   * `null` when there is none yet. Left out, the menu has plain items.
   */
  // eslint-disable-next-line vue/require-default-prop -- left out (undefined) means a plain menu, which a default would hide
  checked?: T | null
  /** Plain items after the others, set apart by a line: things to do rather than a choice. */
  actions?: DropdownMenuItemOption[]
}>()

const emit = defineEmits<{ select: [value: T]; action: [value: string] }>()

const isRadio = computed(() => checked !== undefined)
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
        <component
          :is="isRadio ? DropdownMenuRadioGroup : DropdownMenuGroup"
          v-bind="isRadio ? { modelValue: checked } : {}"
        >
          <component
            :is="isRadio ? DropdownMenuRadioItem : DropdownMenuItem"
            v-for="item in items"
            :key="item.value"
            v-bind="isRadio ? { value: item.value } : {}"
            :disabled="item.disabled"
            :class="ITEM_CLASS"
            @select="emit('select', item.value)"
          >
            <component :is="item.icon" v-if="item.icon" :class="ICON_CLASS" aria-hidden="true" />
            <span class="flex-1">{{ item.label }}</span>
            <DropdownMenuItemIndicator v-if="isRadio">
              <Check class="size-4 text-accent-text" aria-hidden="true" />
            </DropdownMenuItemIndicator>
          </component>
        </component>
        <template v-if="actions.length > 0">
          <DropdownMenuSeparator class="mx-1 my-1 h-px bg-border" />
          <DropdownMenuGroup>
            <DropdownMenuItem
              v-for="item in actions"
              :key="item.value"
              :disabled="item.disabled"
              :class="ITEM_CLASS"
              @select="emit('action', item.value)"
            >
              <component :is="item.icon" v-if="item.icon" :class="ICON_CLASS" aria-hidden="true" />
              <span class="flex-1">{{ item.label }}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
