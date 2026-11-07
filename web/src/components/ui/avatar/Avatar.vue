<script setup>
import { computed, useAttrs } from 'vue';
import { cn } from '../../../lib/utils.js';

defineOptions({ inheritAttrs: false });
const props = defineProps({
  name: { type: String, default: '' },
  src: { type: String, default: '' },
});
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...value } = attrs;
  return value;
});
const classes = computed(() =>
  cn(
    'grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/8 text-xs font-bold uppercase text-primary',
    attrs.class,
  ),
);
const initials = computed(() => (props.name || '?').slice(0, 2));
</script>

<template>
  <div :class="classes" v-bind="rest">
    <img v-if="src" :src="src" alt="" class="size-full object-contain p-1.5" loading="lazy" />
    <span v-else>{{ initials }}</span>
  </div>
</template>
