<script setup>
import { computed, useAttrs } from 'vue';
import { cn } from '../../../lib/utils.js';

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...value } = attrs;
  return value;
});
const classes = computed(() => cn('animate-pulse rounded-xl bg-white/6', attrs.class));
</script>

<template>
  <div :class="classes" v-bind="rest" />
</template>
