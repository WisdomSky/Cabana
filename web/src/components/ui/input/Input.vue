<script setup>
import { computed, useAttrs } from 'vue';
import { cn } from '../../../lib/utils.js';

defineOptions({ inheritAttrs: false });
const props = defineProps({ type: { type: String, default: 'text' } });
const [model, modifiers] = defineModel({ type: [String, Number], default: '' });
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...value } = attrs;
  return value;
});
const classes = computed(() =>
  cn(
    'flex h-10 w-full rounded-xl border border-white/12 bg-white/6 px-3 py-2 text-sm text-foreground shadow-inner shadow-black/10 outline-none transition placeholder:text-muted-foreground/60 focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50',
    attrs.class,
  ),
);
function onInput(event) {
  let value = event.target.value;
  if (props.type === 'number' || modifiers.number) {
    value = value === '' ? '' : Number(value);
  }
  model.value = value;
}
</script>

<template>
  <input v-bind="rest" :type="type" :class="classes" :value="model ?? ''" @input="onInput" />
</template>
