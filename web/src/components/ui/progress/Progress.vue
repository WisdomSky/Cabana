<script setup>
import { computed, useAttrs } from 'vue';
import { ProgressRoot, ProgressIndicator } from 'reka-ui';
import { cn } from '../../../lib/utils.js';

defineOptions({ inheritAttrs: false });
const props = defineProps({
  modelValue: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  indicatorClass: { type: String, default: '' },
});
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...value } = attrs;
  return value;
});
const classes = computed(() => cn('relative h-2 w-full overflow-hidden rounded-full bg-white/8', attrs.class));
const percent = computed(() => Math.max(0, Math.min(100, (props.modelValue / props.max) * 100)));
</script>

<template>
  <ProgressRoot v-bind="rest" :model-value="modelValue" :max="max" :class="classes">
    <ProgressIndicator
      :class="cn('h-full w-full flex-1 rounded-full bg-primary transition-transform duration-500', indicatorClass)"
      :style="{ transform: `translateX(-${100 - percent}%)` }"
    />
  </ProgressRoot>
</template>
