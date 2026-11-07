<template>
  <div class="min-h-screen bg-sand-50">
    <aside class="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-cabana-950 text-white lg:flex">
      <div class="flex items-center gap-3 px-5 pb-5 pt-6">
        <div class="grid size-10 place-items-center rounded-xl bg-cabana-800 ring-1 ring-white/10">
          <svg viewBox="0 0 64 64" class="size-7" aria-hidden="true">
            <path d="M14 41c9 7 27 7 36 0" stroke="#7fd8cc" stroke-width="4" stroke-linecap="round" fill="none" />
            <path d="M20 36c0-11 5-19 13-24-2 8-1 15 2 21" stroke="#f6f0e3" stroke-width="4" stroke-linecap="round" fill="none" />
            <path d="M35 32c4-9 11-13 19-13-3 7-7 11-13 13" stroke="#f6f0e3" stroke-width="4" stroke-linecap="round" fill="none" />
          </svg>
        </div>
        <div>
          <p class="text-lg font-bold leading-none tracking-tight">Cabana</p>
          <p class="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-cabana-300">personal cloud</p>
        </div>
      </div>

      <nav class="flex-1 space-y-1 px-3" aria-label="Main navigation">
        <RouterLink
          v-for="item in nav"
          :key="item.name"
          :to="{ name: item.name }"
          class="nav-link"
          :class="{ 'nav-link-active': route.name === item.name }"
          :data-testid="`nav-${item.name}`"
        >
          <component :is="item.icon" class="size-[18px] shrink-0" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="border-t border-white/10 p-3">
        <div class="flex items-center gap-2 rounded-xl px-2 py-2">
          <div class="grid size-8 place-items-center rounded-lg bg-cabana-800 text-xs font-bold uppercase text-cabana-200">
            {{ initials }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold">{{ session.user?.username }}</p>
            <p class="text-[11px] text-cabana-300">Administrator</p>
          </div>
          <button class="rounded-lg p-1.5 text-cabana-200 hover:bg-white/10 hover:text-white" title="Sign out" data-testid="logout-button" @click="logout">
            <LogOut class="size-4" />
          </button>
        </div>
        <p class="px-2 pt-2 text-[10px] leading-relaxed text-cabana-300/60">
          Cabana {{ version }} · independent project, not affiliated with CasaOS or ZimaOS.
        </p>
      </div>
    </aside>

    <div class="lg:pl-64">
      <header class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-sand-200 bg-sand-50/90 px-4 backdrop-blur lg:hidden">
        <button class="rounded-lg p-2 text-ink hover:bg-sand-100" aria-label="Open menu" data-testid="mobile-menu" @click="menuOpen = true">
          <Menu class="size-5" />
        </button>
        <div class="flex items-center gap-2">
          <div class="grid size-7 place-items-center rounded-lg bg-cabana-900">
            <Waves class="size-4 text-cabana-200" />
          </div>
          <span class="font-bold">Cabana</span>
        </div>
        <span class="ml-auto text-xs font-medium text-muted">{{ route.meta.title }}</span>
      </header>

      <main class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <RouterView />
      </main>
    </div>

    <Teleport to="body">
      <div v-if="menuOpen" class="fixed inset-0 z-50 lg:hidden">
        <div class="absolute inset-0 bg-cabana-950/40 backdrop-blur-[2px]" @click="menuOpen = false" />
        <aside class="absolute inset-y-0 left-0 flex w-72 flex-col bg-cabana-950 text-white shadow-2xl">
          <div class="flex items-center justify-between px-4 pt-4">
            <span class="text-lg font-bold">Cabana</span>
            <button class="rounded-lg p-2 text-cabana-200 hover:bg-white/10" aria-label="Close menu" @click="menuOpen = false">
              <X class="size-5" />
            </button>
          </div>
          <nav class="mt-4 flex-1 space-y-1 px-3">
            <RouterLink
              v-for="item in nav"
              :key="item.name"
              :to="{ name: item.name }"
              class="nav-link"
              :class="{ 'nav-link-active': route.name === item.name }"
              @click="menuOpen = false"
            >
              <component :is="item.icon" class="size-[18px]" />
              {{ item.label }}
            </RouterLink>
          </nav>
          <div class="border-t border-white/10 p-4 text-sm">
            <p class="font-semibold">{{ session.user?.username }}</p>
            <button class="mt-2 inline-flex items-center gap-2 text-cabana-200" @click="logout">
              <LogOut class="size-4" /> Sign out
            </button>
          </div>
        </aside>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import {
  Boxes,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Store,
  Waves,
  X,
} from 'lucide-vue-next';
import { api } from '../lib/api.js';
import { clearLogin, session } from '../session.js';
import { toast } from '../lib/toast.js';

const route = useRoute();
const router = useRouter();
const menuOpen = ref(false);
const version = ref('1.0.0');

const nav = [
  { name: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { name: 'store', label: 'App store', icon: Store },
  { name: 'apps', label: 'My apps', icon: Boxes },
  { name: 'files', label: 'Files', icon: FolderOpen },
  { name: 'storage', label: 'Storage', icon: HardDrive },
  { name: 'settings', label: 'Settings', icon: Settings },
];

const initials = computed(() => (session.user?.username || 'A').slice(0, 2));

async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    // The local session is cleared regardless.
  }
  clearLogin();
  menuOpen.value = false;
  toast('Signed out.');
  await router.replace('/login');
}

onMounted(async () => {
  try {
    const health = await api('/health', { auth: false });
    version.value = health.version || version.value;
  } catch {
    // ignore
  }
});
</script>
