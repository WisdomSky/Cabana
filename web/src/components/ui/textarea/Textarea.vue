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
    'flex min-h-24 w-full rounded-xl border border-white/12 bg-white/6 px-3 py-2 text-sm text-foreground shadow-inner shadow-black/10 outline-none transition placeholder:text-muted-foreground/60 focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50',
    attrs.class,
  ),
);
</script>

<template>
  <textarea v-bind="rest" :class="classes" :value="model ?? ''" @input="model = $event.target.value" />
</template>
