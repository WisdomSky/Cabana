<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.16em] text-cabana-600">My apps</p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Installed applications</h1>
        <p class="mt-1 text-sm text-muted">
          {{ counts.running }} running · {{ counts.stopped }} stopped · {{ counts.total }} installed
          <span v-if="orphans.length"> · {{ orphans.length }} untracked container{{ orphans.length === 1 ? '' : 's' }}</span>
        </p>
      </div>
      <div class="flex gap-2">
        <button class="btn-secondary btn-sm" :disabled="loading" @click="load(true)">
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': loading }" /> Refresh
        </button>
        <button class="btn-primary btn-sm" data-testid="import-compose" @click="openImport">
          <FilePlus2 class="size-3.5" /> Import Compose
        </button>
      </div>
    </div>

    <div v-if="error" class="rounded-xl border border-coral-500/30 bg-coral-100 px-4 py-3 text-sm text-coral-500">
      {{ error }}
    </div>

    <div v-if="orphans.length" class="rounded-xl border border-yellow-300/60 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
      <p class="font-semibold">Untracked Cabana containers</p>
      <p class="mt-1 text-xs">{{ orphans.map((o) => `${o.name} (${o.state})`).join(', ') }}</p>
    </div>

    <div v-if="loading && !apps.length" class="grid gap-4">
      <div v-for="i in 2" :key="i" class="card h-28 animate-pulse bg-white/60" />
    </div>

    <div v-else-if="!apps.length" class="card p-10 text-center">
      <Boxes class="mx-auto size-10 text-cabana-300" />
      <p class="mt-3 font-semibold">Nothing installed yet</p>
      <p class="mt-1 text-sm text-muted">Install an app from the store, or import your own Compose file.</p>
      <div class="mt-5 flex justify-center gap-2">
        <RouterLink :to="{ name: 'store' }" class="btn-primary btn-sm">Browse store</RouterLink>
        <button class="btn-secondary btn-sm" @click="openImport">Import Compose</button>
      </div>
    </div>

    <div v-else class="space-y-3">
      <article
        v-for="app in apps"
        :key="app.id"
        class="card p-4"
        :data-testid="`app-row-${app.id}`"
      >
        <div class="flex flex-wrap items-start gap-3">
          <img
            v-if="app.iconPath"
            :src="iconUrl(app.iconPath)"
            alt=""
            class="size-11 rounded-xl border border-sand-200 bg-white object-contain p-1"
          />
          <div v-else class="grid size-11 place-items-center rounded-xl bg-cabana-100 text-sm font-bold uppercase text-cabana-700">
            {{ app.title.slice(0, 2) }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-bold">{{ app.title }}</h2>
              <AppStatusBadge :status="app.status" :health="app.health" />
              <span class="chip">{{ app.source === 'store' ? 'Store' : 'Custom' }}</span>
              <span v-if="app.version" class="text-[11px] text-muted">v{{ app.version }}</span>
            </div>
            <p class="mt-1 text-xs text-muted">
              {{ app.containers.length }} container{{ app.containers.length === 1 ? '' : 's' }}
              <span v-if="app.port"> · port {{ app.port }}</span>
              · {{ app.mainService || 'main service' }}
            </p>
            <div v-if="app.containers.length" class="mt-2 flex flex-wrap gap-1.5">
              <span
                v-for="container in app.containers"
                :key="container.name"
                class="rounded-md bg-sand-100 px-2 py-1 font-mono text-[10px] text-muted"
                :title="container.statusText"
              >
                {{ container.name }} · {{ container.state }}
              </span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <a
              v-if="app.status === 'running' && app.port"
              :href="appUrl(app)"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-secondary btn-sm"
            >
              <ExternalLink class="size-3.5" /> Open
            </a>
            <button
              v-if="app.status === 'stopped' || app.status === 'error' || app.status === 'missing'"
              class="btn-secondary btn-sm"
              :data-testid="`start-${app.id}`"
              :disabled="busy === app.id"
              @click="action(app, 'start')"
            >
              <Play class="size-3.5" /> Start
            </button>
            <button
              v-else-if="app.status === 'running'"
              class="btn-secondary btn-sm"
              :data-testid="`stop-${app.id}`"
              :disabled="busy === app.id"
              @click="action(app, 'stop')"
            >
              <Square class="size-3.5" /> Stop
            </button>
            <button
              class="btn-ghost btn-sm text-coral-500 hover:bg-coral-100"
              :data-testid="`uninstall-${app.id}`"
              @click="askUninstall(app)"
            >
              <Trash2 class="size-3.5" /> Uninstall
            </button>
          </div>
        </div>
        <div v-if="app.warnings?.length" class="mt-3 border-t border-sand-100 pt-2">
          <details class="text-xs text-muted">
            <summary class="cursor-pointer font-semibold">Notes &amp; warnings ({{ app.warnings.length }})</summary>
            <ul class="mt-2 list-disc space-y-1 pl-5">
              <li v-for="(warning, i) in app.warnings" :key="i">{{ warning.message }}</li>
            </ul>
          </details>
        </div>
      </article>
    </div>

    <Modal :open="importOpen" title="Import a Compose file" subtitle="Run your own Docker Compose definition under Cabana." @close="closeImport">
      <div class="space-y-4">
        <div>
          <label class="label" for="import-title">App name</label>
          <input id="import-title" v-model.trim="importTitle" class="input" placeholder="My custom app" data-testid="custom-title" />
        </div>
        <div>
          <label class="label" for="import-compose">docker-compose.yml</label>
          <textarea
            id="import-compose"
            v-model="importCompose"
            class="input min-h-56 font-mono text-xs leading-relaxed"
            spellcheck="false"
            placeholder="services:&#10;  my-app:&#10;    image: nginx:alpine&#10;    ports:&#10;      - '8080:80'"
            data-testid="custom-compose"
          />
          <p class="mt-1 text-xs text-muted">
            Source builds are not supported. Custom images are not vetted by Cabana.
          </p>
        </div>

        <div v-if="analysis" class="space-y-3 rounded-xl border border-sand-200 bg-white p-4" data-testid="custom-analysis">
          <div class="flex flex-wrap gap-2 text-xs text-muted">
            <span class="chip">id: {{ analysis.id }}</span>
            <span class="chip">port: {{ analysis.port || 'none' }}</span>
            <span class="chip">{{ analysis.services.length }} service{{ analysis.services.length === 1 ? '' : 's' }}</span>
          </div>
          <ul v-if="analysis.warnings.length" class="space-y-1.5">
            <li
              v-for="(warning, i) in analysis.warnings"
              :key="i"
              class="rounded-lg px-2.5 py-2 text-xs leading-relaxed"
              :class="dangerous(warning) ? 'bg-coral-100 text-coral-500' : 'bg-amber-50 text-amber-900'"
            >
              {{ warning.message }}
            </li>
          </ul>
          <label v-if="analysis.needsConfirmation" class="flex items-start gap-2 rounded-lg border border-coral-500/30 bg-coral-100/60 p-3 text-xs font-medium text-coral-500">
            <input v-model="riskConfirmed" type="checkbox" class="mt-0.5" data-testid="custom-confirm" />
            I understand this Compose file requests elevated host access and want to install it anyway.
          </label>
        </div>

        <div v-if="importError" class="rounded-xl border border-coral-500/30 bg-coral-100 px-4 py-3 text-sm text-coral-500" data-testid="custom-error">
          <p class="font-semibold">Could not install</p>
          <p class="mt-1 whitespace-pre-line text-xs">{{ importError }}</p>
          <pre v-if="importDetails" class="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 font-mono text-[10px]">{{ importDetails }}</pre>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="closeImport">Cancel</button>
        <button v-if="!analysis" class="btn-primary" :disabled="analyzing" data-testid="custom-analyze" @click="analyze">
          <Loader2 v-if="analyzing" class="size-4 animate-spin" /> Analyze
        </button>
        <button
          v-else
          class="btn-primary"
          :disabled="installing || (analysis.needsConfirmation && !riskConfirmed)"
          data-testid="custom-install"
          @click="installCustom"
        >
          <Loader2 v-if="installing" class="size-4 animate-spin" />
          {{ installing ? 'Installing…' : 'Install app' }}
        </button>
      </template>
    </Modal>

    <Modal :open="Boolean(uninstallApp)" title="Uninstall app" :subtitle="uninstallApp?.title" @close="uninstallApp = null">
      <div class="space-y-4">
        <p class="text-sm leading-relaxed">
          This removes the app’s containers and networks. App data is <strong>kept</strong> by default.
        </p>
        <div class="rounded-xl border border-sand-200 bg-white p-3 text-xs leading-relaxed text-muted">
          Data lives in <code class="rounded bg-sand-100 px-1 py-0.5 font-mono">/DATA/AppData/{{ uninstallApp?.id }}</code>
          plus any folders the app mounts under <code class="font-mono">/DATA</code>.
        </div>
        <label class="flex items-start gap-2 rounded-xl border border-coral-500/30 bg-coral-100/60 p-3 text-xs leading-relaxed text-coral-500">
          <input v-model="deleteData" type="checkbox" class="mt-0.5" data-testid="uninstall-delete-data" />
          <span>
            <strong>Also permanently delete this app’s data.</strong>
            Files in its /DATA folders and its named Docker volumes will be removed. This cannot be undone.
          </span>
        </label>
        <p v-if="uninstallError" class="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-500">{{ uninstallError }}</p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="uninstallApp = null">Cancel</button>
        <button class="btn-danger" :disabled="uninstalling" data-testid="uninstall-confirm" @click="uninstall">
          <Loader2 v-if="uninstalling" class="size-4 animate-spin" />
          {{ deleteData ? 'Delete app and data' : 'Uninstall and keep data' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  Boxes,
  ExternalLink,
  FilePlus2,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Trash2,
} from 'lucide-vue-next';
import Modal from '../components/Modal.vue';
import AppStatusBadge from '../components/AppStatusBadge.vue';
import { api, appUrl, iconUrl } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const apps = ref([]);
const orphans = ref([]);
const loading = ref(true);
const error = ref('');
const busy = ref(null);

const importOpen = ref(false);
const importTitle = ref('');
const importCompose = ref('');
const analysis = ref(null);
const analyzing = ref(false);
const installing = ref(false);
const riskConfirmed = ref(false);
const importError = ref('');
const importDetails = ref('');

const uninstallApp = ref(null);
const deleteData = ref(false);
const uninstalling = ref(false);
const uninstallError = ref('');

const counts = computed(() => ({
  total: apps.value.length,
  running: apps.value.filter((a) => a.status === 'running').length,
  stopped: apps.value.filter((a) => a.status === 'stopped').length,
}));

async function load(showSpinner = false) {
  if (showSpinner) loading.value = true;
  try {
    const data = await api('/apps');
    apps.value = data.apps;
    orphans.value = data.orphans || [];
    error.value = '';
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function action(app, verb) {
  busy.value = app.id;
  try {
    await api(`/apps/${encodeURIComponent(app.id)}/${verb}`, { method: 'POST' });
    toast(`${app.title} ${verb === 'start' ? 'started' : 'stopped'}.`);
    await load();
  } catch (err) {
    toast(err.message, 'error', 9000);
  } finally {
    busy.value = null;
  }
}

function openImport() {
  importOpen.value = true;
  importTitle.value = '';
  importCompose.value = '';
  analysis.value = null;
  riskConfirmed.value = false;
  importError.value = '';
  importDetails.value = '';
}

function closeImport() {
  if (installing.value) return;
  importOpen.value = false;
}

function dangerous(warning) {
  return ['privileged', 'host_network', 'host_pid', 'host_ipc', 'cap_add', 'devices', 'docker_socket', 'sensitive_mount'].includes(warning.code);
}

async function analyze() {
  analyzing.value = true;
  importError.value = '';
  try {
    analysis.value = await api('/apps/analyze', {
      method: 'POST',
      body: { compose: importCompose.value, title: importTitle.value },
    });
    riskConfirmed.value = false;
  } catch (err) {
    importError.value = err.message;
  } finally {
    analyzing.value = false;
  }
}

async function installCustom() {
  installing.value = true;
  importError.value = '';
  importDetails.value = '';
  try {
    const result = await api('/apps/custom', {
      method: 'POST',
      body: {
        compose: importCompose.value,
        title: importTitle.value,
        id: analysis.value?.id,
        confirmRisk: riskConfirmed.value,
      },
    });
    toast(`${result.title} installed.`);
    importOpen.value = false;
    await load();
  } catch (err) {
    importError.value = err.message;
    importDetails.value = err.details?.output || null;
    if (err.code === 'confirmation_required') {
      riskConfirmed.value = false;
    }
  } finally {
    installing.value = false;
  }
}

function askUninstall(app) {
  uninstallApp.value = app;
  deleteData.value = false;
  uninstallError.value = '';
}

async function uninstall() {
  if (!uninstallApp.value) return;
  uninstalling.value = true;
  uninstallError.value = '';
  try {
    const result = await api(`/apps/${encodeURIComponent(uninstallApp.value.id)}/uninstall`, {
      method: 'POST',
      body: { deleteData: deleteData.value },
    });
    toast(
      result.dataDeleted
        ? `${uninstallApp.value.title} and its data were deleted.`
        : `${uninstallApp.value.title} uninstalled; data was preserved.`,
    );
    uninstallApp.value = null;
    await load();
  } catch (err) {
    uninstallError.value = err.message;
  } finally {
    uninstalling.value = false;
  }
}

onMounted(() => load());
</script>
