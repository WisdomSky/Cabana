<script setup>
import { computed, useAttrs } from 'vue';
import { cn } from '../../../lib/utils.js';

defineOptions({ inheritAttrs: false });
const model = defineModel({ type: [String, Number], default: '' });
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...value } = attrs;
  return value;
});
const classes = computed(() =>
  cn(
    'h-10 w-full appearance-none rounded-xl border border-white/12 bg-white/6 px-3 py-2 text-sm text-foreground outline-none transition focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50',
    attrs.class,
  ),
);
</script>

<template>
  <select v-bind="rest" :class="classes" :value="model ?? ''" @change="model = $event.target.value">
    <slot />
  </select>
</template>
