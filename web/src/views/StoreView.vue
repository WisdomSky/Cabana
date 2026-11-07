<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.16em] text-primary">App store</p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Find something useful</h1>
        <p class="mt-1 max-w-2xl text-sm text-muted">
          {{ store?.appCount ? `${store.appCount} published apps` : 'Published apps' }}
          <span v-if="store?.updatedAt"> · store updated {{ relativeTime(store.updatedAt) }}</span>
          · definitions from the official CasaOS/ZimaOS app store.
        </p>
      </div>
      <Button variant="secondary" size="sm" :disabled="refreshingStore" data-testid="store-refresh" @click="refreshStore">
        <RefreshCw class="size-3.5" :class="{ 'animate-spin': refreshingStore }" /> Refresh store
      </Button>
    </div>

    <Card class="p-3 sm:p-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div class="relative flex-1">
          <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            v-model="query"
            class="pl-9"
            placeholder="Search apps, developers, categories…"
            aria-label="Search the app store"
            data-testid="store-search"
          />
        </div>
        <div class="flex items-center gap-2">
          <label class="sr-only" for="store-arch">Architecture</label>
          <Select id="store-arch" v-model="arch" class="w-auto min-w-44" data-testid="store-arch">
            <option :value="hostArch">Compatible with this host ({{ hostArch }})</option>
            <option value="all">All architectures</option>
            <option value="amd64">amd64</option>
            <option value="arm64">arm64</option>
          </Select>
          <span class="chip shrink-0" data-testid="store-count">{{ apps.length }} shown</span>
        </div>
      </div>

      <div class="mt-3 flex gap-2 overflow-x-auto pb-1">
        <Button
          :variant="!category ? 'default' : 'secondary'"
          size="sm"
          class="shrink-0 rounded-full"
          data-testid="category-all"
          @click="category = ''"
        >
          All
        </Button>
        <Button
          v-for="cat in categories"
          :key="cat.id"
          :variant="category === cat.id ? 'default' : 'secondary'"
          size="sm"
          class="shrink-0 rounded-full"
          :data-testid="`category-${cat.id}`"
          @click="category = cat.id"
        >
          {{ cat.name }} <span class="opacity-60">{{ cat.count }}</span>
        </Button>
      </div>
    </Card>

    <div v-if="error" class="rounded-xl border border-coral-500/30 bg-coral-100 px-4 py-3 text-sm text-coral-500">
      {{ error }}
      <button class="ml-2 font-semibold underline" @click="load">Retry</button>
    </div>
    <div v-else-if="store?.stale" class="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
      Showing the cached store index; the official store could not be refreshed.
    </div>

    <div v-if="loading" class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div v-for="i in 6" :key="i" class="card h-40 animate-pulse bg-white/5" />
    </div>

    <Card v-else-if="!apps.length" class="p-10 text-center">
      <StoreIcon class="mx-auto size-10 text-cabana-300" />
      <p class="mt-3 font-semibold">No apps match those filters</p>
      <p class="mt-1 text-sm text-muted">Try a different search or category.</p>
    </Card>

    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <button
        v-for="app in apps"
        :key="app.id"
        class="card group flex flex-col p-4 text-left transition hover:-translate-y-0.5 hover:border-cabana-300 hover:shadow-md"
        :data-testid="`store-app-${app.id}`"
        @click="openApp(app)"
      >
        <div class="flex items-start gap-3">
          <img
            v-if="app.iconPath"
            :src="iconUrl(app.iconPath)"
            alt=""
            class="size-12 rounded-xl border border-white/10 bg-white/8 object-contain p-1.5"
            loading="lazy"
          />
          <div v-else class="grid size-12 place-items-center rounded-xl border border-white/10 bg-white/8 font-bold text-primary">
            {{ app.title.slice(0, 2) }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <p class="truncate font-bold">{{ app.title }}</p>
              <Badge v-if="app.installed" variant="success" class="shrink-0">Installed</Badge>
            </div>
            <p class="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{{ app.tagline || app.developer }}</p>
          </div>
        </div>
        <div class="mt-4 flex items-center gap-2 text-[11px] text-muted">
          <span class="rounded-md bg-sand-100 px-1.5 py-0.5 font-semibold">{{ app.category }}</span>
          <span v-if="app.version">v{{ app.version }}</span>
          <span class="ml-auto flex gap-1">
            <span v-for="a in app.architectures.slice(0, 3)" :key="a" class="rounded bg-sand-100 px-1 py-0.5 font-mono text-[10px]">{{ a }}</span>
          </span>
        </div>
        <p v-if="!app.architectures.includes(hostArch)" class="mt-2 text-[11px] font-semibold text-coral-500">
          Not compatible with this host’s architecture
        </p>
      </button>
    </div>

    <p class="text-center text-xs text-muted">
      App definitions from the
      <a href="https://github.com/IceWhaleTech/CasaOS-AppStore" target="_blank" rel="noopener noreferrer" class="font-semibold text-primary hover:underline">official CasaOS/ZimaOS app store</a>.
      Cabana is an independent project and is not affiliated with CasaOS or ZimaOS.
    </p>

    <Modal :open="Boolean(detailOpen)" :title="detail?.app?.title || 'App details'" :subtitle="detail?.app?.tagline" @close="closeDetail">
      <div v-if="detailLoading" class="flex items-center justify-center py-10 text-sm text-muted">
        <Loader2 class="mr-2 size-4 animate-spin" /> Loading app details…
      </div>
      <div v-else-if="detailError" class="rounded-xl border border-coral-500/30 bg-coral-100 px-4 py-3 text-sm text-coral-500">
        {{ detailError }}
      </div>
      <div v-else-if="detail?.app" class="space-y-5" data-testid="store-detail">
        <div class="flex items-start gap-4">
          <img
            v-if="detail.app.iconPath"
            :src="iconUrl(detail.app.iconPath)"
            alt=""
            class="size-16 rounded-2xl border border-white/10 bg-white/8 object-contain p-2"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-xl font-bold">{{ detail.app.title }}</h3>
              <span v-if="detail.app.version" class="chip">v{{ detail.app.version }}</span>
              <Badge v-if="detail.installed" variant="success">Installed</Badge>
            </div>
            <p class="mt-1 text-sm text-muted">{{ detail.app.developer }} · {{ detail.app.category }}</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="a in detail.app.architectures" :key="a" class="rounded-md bg-sand-100 px-1.5 py-0.5 font-mono text-[10px] text-muted">{{ a }}</span>
            </div>
          </div>
        </div>

        <div v-if="detail.app.screenshotsPaths?.length" class="flex gap-2 overflow-x-auto rounded-xl">
          <img
            v-for="shot in detail.app.screenshotsPaths.slice(0, 4)"
            :key="shot"
            :src="`/api/store/asset?path=${encodeURIComponent(shot)}`"
            alt="App screenshot"
            class="h-36 rounded-xl border border-sand-200 object-cover"
            loading="lazy"
          />
        </div>

        <p class="whitespace-pre-line text-sm leading-relaxed text-ink/90">{{ detail.app.description }}</p>

        <div v-if="detail.app.tips?.before_install" class="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
          <p class="font-bold uppercase tracking-wide">Before you install</p>
          <p class="mt-1 whitespace-pre-line">{{ detail.app.tips.before_install }}</p>
        </div>

        <dl class="grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-xl bg-white/6 p-3 ring-1 ring-white/10">
            <dt class="text-[11px] font-semibold uppercase tracking-wide text-muted">Port</dt>
            <dd class="mt-0.5 font-mono font-semibold">{{ detail.app.portMap || 'not published' }}</dd>
          </div>
          <div class="rounded-xl bg-white/6 p-3 ring-1 ring-white/10">
            <dt class="text-[11px] font-semibold uppercase tracking-wide text-muted">Data</dt>
            <dd class="mt-0.5 font-mono text-xs font-semibold">/DATA/AppData</dd>
          </div>
        </dl>

        <p v-if="detail.app.website || detail.app.repo" class="text-xs text-muted">
          <a v-if="detail.app.website" :href="detail.app.website" target="_blank" rel="noopener noreferrer" class="font-semibold text-primary hover:underline">Website</a>
          <span v-if="detail.app.website && detail.app.repo"> · </span>
          <a v-if="detail.app.repo" :href="detail.app.repo" target="_blank" rel="noopener noreferrer" class="font-semibold text-primary hover:underline">Source repository</a>
        </p>

        <div v-if="installError" class="rounded-xl border border-coral-500/30 bg-coral-100 px-4 py-3 text-sm text-coral-500" data-testid="install-error">
          <p class="font-semibold">Install failed</p>
          <p class="mt-1 whitespace-pre-line text-xs leading-relaxed">{{ installError }}</p>
          <pre v-if="installDetails" class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 font-mono text-[10px] leading-relaxed">{{ installDetails }}</pre>
        </div>
      </div>

      <template #footer>
        <Button variant="secondary" @click="closeDetail">Close</Button>
        <Button
          v-if="detail?.app && !detail.installed"
          :disabled="installing || !detail.app.architectures.includes(hostArch)"
          data-testid="store-install"
          @click="install"
        >
          <Loader2 v-if="installing" class="size-4 animate-spin" />
          {{ installing ? 'Installing…' : 'Install app' }}
        </Button>
        <Button v-else-if="detail?.installed" variant="secondary" as-child>
          <RouterLink :to="{ name: 'apps' }">Manage app</RouterLink>
        </Button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { Loader2, RefreshCw, Search, Store as StoreIcon } from 'lucide-vue-next';
import Modal from '../components/ui/dialog/Dialog.vue';
import Badge from '../components/ui/badge/Badge.vue';
import Button from '../components/ui/button/Button.vue';
import Card from '../components/ui/card/Card.vue';
import Input from '../components/ui/input/Input.vue';
import Select from '../components/ui/select/Select.vue';
import { api, iconUrl, relativeTime } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const store = ref(null);
const apps = ref([]);
const categories = ref([]);
const query = ref('');
const category = ref('');
const arch = ref('');
const hostArch = ref('amd64');
const loading = ref(true);
const error = ref('');
const refreshingStore = ref(false);

const detailOpen = ref(false);
const detail = ref(null);
const detailLoading = ref(false);
const detailError = ref('');
const installing = ref(false);
const installError = ref('');
const installDetails = ref('');

let searchTimer = null;

async function load() {
  loading.value = true;
  try {
    const data = await api('/store', {
      query: { q: query.value, category: category.value, arch: arch.value || undefined },
    });
    store.value = data;
    apps.value = data.apps;
    categories.value = data.categories;
    hostArch.value = data.hostArch;
    if (!arch.value) arch.value = data.hostArch;
    error.value = '';
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function scheduleLoad() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 250);
}

watch(query, scheduleLoad);
watch(category, load);
watch(arch, load);

async function refreshStore() {
  refreshingStore.value = true;
  try {
    const result = await api('/store/refresh', { method: 'POST' });
    toast(`Store refreshed: ${result.appCount} apps.`);
    await load();
  } catch (err) {
    toast(err.message, 'error', 8000);
  } finally {
    refreshingStore.value = false;
  }
}

async function openApp(app) {
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = '';
  installError.value = '';
  installDetails.value = '';
  detail.value = null;
  try {
    detail.value = await api(`/store/apps/${encodeURIComponent(app.id)}`);
  } catch (err) {
    detailError.value = err.message;
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  if (installing.value) return;
  detailOpen.value = false;
}

async function install() {
  if (!detail.value?.app) return;
  installing.value = true;
  installError.value = '';
  installDetails.value = '';
  try {
    await api(`/apps/store/${encodeURIComponent(detail.value.app.id)}/install`, { method: 'POST' });
    toast(`${detail.value.app.title} installed.`);
    detail.value.installed = { id: detail.value.app.id };
    await load();
  } catch (err) {
    installError.value = err.message;
    installDetails.value = err.details?.output || null;
  } finally {
    installing.value = false;
  }
}

onMounted(load);
onBeforeUnmount(() => clearTimeout(searchTimer));
</script>
