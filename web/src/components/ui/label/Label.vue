<script setup>
import { computed, useAttrs } from 'vue';
import { cn } from '../../../lib/utils.js';

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...value } = attrs;
  return value;
});
const classes = computed(() => cn('mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground', attrs.class));
</script>

<template>
  <label :class="classes" v-bind="rest"><slot /></label>
</template>
