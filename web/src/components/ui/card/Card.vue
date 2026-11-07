<script setup>
import { computed, useAttrs } from 'vue';
import { cn } from '../../../lib/utils.js';

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...value } = attrs;
  return value;
});
const classes = computed(() =>
  cn('rounded-2xl border border-white/10 bg-card/80 text-card-foreground shadow-2xl shadow-black/20 backdrop-blur-xl', attrs.class),
);
</script>

<template>
  <div :class="classes" v-bind="rest">
    <slot />
  </div>
</template>
