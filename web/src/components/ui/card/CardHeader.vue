<script setup>
import { computed, useAttrs } from 'vue';
import { cn } from '../../../lib/utils.js';

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...value } = attrs;
  return value;
});
const classes = computed(() => cn('flex flex-col gap-1.5 p-5', attrs.class));
</script>

<template>
  <div :class="classes" v-bind="rest"><slot /></div>
</template>
