<script setup>
import { computed, useAttrs } from 'vue';
import { cn } from '../../../lib/utils.js';

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...value } = attrs;
  return value;
});
const classes = computed(() => cn('text-base font-bold leading-none tracking-tight', attrs.class));
</script>

<template>
  <h3 :class="classes" v-bind="rest"><slot /></h3>
</template>
