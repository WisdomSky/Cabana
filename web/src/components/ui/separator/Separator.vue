<script setup>
import { computed, useAttrs } from 'vue';
import { cn } from '../../../lib/utils.js';

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...value } = attrs;
  return value;
});
const classes = computed(() => cn('my-4 h-px w-full bg-white/10', attrs.class));
</script>

<template>
  <div role="separator" :class="classes" v-bind="rest" />
</template>
