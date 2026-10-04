import { createStore } from './store';

export interface ToastState {
  id: number;
  message: string;
  tone: 'default' | 'error';
  action?: { label: string; onPress: () => void };
}

export const toastStore = createStore<ToastState | null>(null);
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

function show(message: string, opts: Omit<ToastState, 'id' | 'message'>, durationMs: number) {
  const id = nextId++;
  toastStore.set({ id, message, ...opts });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (toastStore.get()?.id === id) toastStore.set(null);
  }, durationMs);
}

export const toast = {
  show(message: string, action?: ToastState['action']) {
    show(message, { tone: 'default', action }, action ? 5000 : 2500);
  },
  error(message: string) {
    show(message, { tone: 'error' }, 4000);
  },
  dismiss() {
    toastStore.set(null);
  },
};
