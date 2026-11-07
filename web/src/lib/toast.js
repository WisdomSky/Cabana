import { reactive } from 'vue';

let nextId = 1;
export const toasts = reactive([]);

export function toast(message, type = 'success', timeout = 5000) {
  const id = nextId++;
  toasts.push({ id, message, type });
  if (timeout) {
    setTimeout(() => dismiss(id), timeout);
  }
  return id;
}

export function dismiss(id) {
  const index = toasts.findIndex((t) => t.id === id);
  if (index >= 0) toasts.splice(index, 1);
}
