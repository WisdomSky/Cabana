<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.16em] text-cabana-600">Files</p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Your data, close at hand</h1>
        <p class="mt-1 text-sm text-muted">Browse and manage files inside the roots configured by the administrator.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-secondary btn-sm" data-testid="files-refresh" :disabled="loading" @click="load">
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': loading }" /> Refresh
        </button>
        <button class="btn-secondary btn-sm" data-testid="mkdir-button" @click="openMkdir">
          <FolderPlus class="size-3.5" /> New folder
        </button>
        <button class="btn-primary btn-sm" data-testid="upload-button" :disabled="uploading" @click="fileInput?.click()">
          <Loader2 v-if="uploading" class="size-3.5 animate-spin" />
          <Upload v-else class="size-3.5" />
          {{ uploading ? 'Uploading…' : 'Upload' }}
        </button>
        <input ref="fileInput" type="file" class="hidden" data-testid="upload-input" @change="onUpload" />
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="flex flex-wrap items-center gap-2 border-b border-sand-200 px-3 py-3 sm:px-4">
        <select v-model="rootId" class="input w-auto max-w-full py-1.5 text-xs" data-testid="files-root-select" @change="changeRoot">
          <option v-for="root in roots" :key="root.id" :value="String(root.id)">{{ root.path }}</option>
        </select>
        <nav class="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb" data-testid="files-breadcrumb">
          <button class="rounded px-1.5 py-0.5 font-semibold text-cabana-700 hover:bg-sand-100" @click="navigate('')">
            {{ currentRoot?.path || 'root' }}
          </button>
          <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
            <ChevronRight class="size-3.5 text-muted" />
            <button class="rounded px-1.5 py-0.5 hover:bg-sand-100" @click="navigate(crumb.path)">
              {{ crumb.name }}
            </button>
          </template>
        </nav>
        <span class="chip">{{ entries.length }} item{{ entries.length === 1 ? '' : 's' }}</span>
      </div>

      <div v-if="error" class="px-4 py-3 text-sm text-coral-500">{{ error }}</div>
      <div v-if="loading" class="flex items-center justify-center py-16 text-sm text-muted">
        <Loader2 class="mr-2 size-4 animate-spin" /> Reading folder…
      </div>
      <div v-else-if="!entries.length" class="px-4 py-16 text-center">
        <FolderOpen class="mx-auto size-9 text-cabana-300" />
        <p class="mt-2 text-sm font-semibold">This folder is empty</p>
        <p class="mt-1 text-xs text-muted">Upload a file or create a folder.</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[560px] text-sm">
          <thead class="border-b border-sand-100 bg-sand-50/60">
            <tr>
              <th class="table-head">Name</th>
              <th class="table-head">Size</th>
              <th class="table-head">Modified</th>
              <th class="table-head text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-sand-100">
            <tr
              v-for="entry in entries"
              :key="entry.path"
              class="group hover:bg-sand-50/70"
              :data-testid="`file-${entry.name}`"
            >
              <td class="max-w-[420px] px-4 py-2.5">
                <div class="flex items-center gap-2">
                  <Folder v-if="entry.type === 'directory'" class="size-4 shrink-0 text-amber-500" />
                  <FileText v-else-if="entry.type === 'file'" class="size-4 shrink-0 text-cabana-500" />
                  <Link2 v-else class="size-4 shrink-0" :class="entry.escape ? 'text-coral-500' : 'text-muted'" />
                  <button
                    v-if="entry.type === 'directory' || (entry.type === 'symlink' && !entry.escape)"
                    class="truncate text-left font-medium hover:text-cabana-700 hover:underline"
                    @click="navigate(entry.path)"
                  >
                    {{ entry.name }}
                  </button>
                  <a
                    v-else-if="entry.type === 'file'"
                    :href="downloadUrl(entry.path)"
                    class="truncate font-medium hover:text-cabana-700 hover:underline"
                    :data-testid="`download-${entry.name}`"
                  >
                    {{ entry.name }}
                  </a>
                  <span v-else class="truncate">{{ entry.name }}</span>
                  <span v-if="entry.escape" class="rounded bg-coral-100 px-1.5 py-0.5 text-[10px] font-bold text-coral-500">outside root</span>
                  <span v-else-if="entry.type === 'symlink'" class="rounded bg-sand-100 px-1.5 py-0.5 text-[10px] text-muted">symlink</span>
                </div>
              </td>
              <td class="px-4 py-2.5 text-xs text-muted">{{ entry.type === 'directory' ? '—' : formatBytes(entry.size) }}</td>
              <td class="px-4 py-2.5 text-xs text-muted">{{ formatDate(entry.mtime) }}</td>
              <td class="px-4 py-2.5">
                <div class="flex justify-end gap-1">
                  <a
                    v-if="entry.type === 'file' || (entry.type === 'symlink' && !entry.escape)"
                    :href="downloadUrl(entry.path)"
                    class="rounded-lg p-1.5 text-muted hover:bg-sand-100 hover:text-ink"
                    title="Download"
                  >
                    <Download class="size-4" />
                  </a>
                  <button
                    class="rounded-lg p-1.5 text-muted hover:bg-sand-100 hover:text-ink"
                    :data-testid="`rename-${entry.name}`"
                    title="Rename"
                    @click="openRename(entry)"
                  >
                    <Pencil class="size-4" />
                  </button>
                  <button
                    class="rounded-lg p-1.5 text-muted hover:bg-coral-100 hover:text-coral-500"
                    :data-testid="`delete-${entry.name}`"
                    title="Delete"
                    @click="openDelete(entry)"
                  >
                    <Trash2 class="size-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p class="text-xs leading-relaxed text-muted">
      <ShieldCheck class="mr-1 inline size-3.5 text-cabana-500" />
      Access is confined to the configured roots. Path traversal and symlinks that escape a root are refused.
      Cabana never mounts, formats, or partitions disks.
    </p>

    <Modal :open="mkdirOpen" title="New folder" subtitle="Create a folder in the current directory." @close="mkdirOpen = false">
      <label class="label" for="mkdir-name">Folder name</label>
      <input id="mkdir-name" v-model.trim="mkdirName" class="input" data-testid="mkdir-name" @keyup.enter="createFolder" />
      <p v-if="dialogError" class="mt-2 text-sm text-coral-500">{{ dialogError }}</p>
      <template #footer>
        <button class="btn-secondary" @click="mkdirOpen = false">Cancel</button>
        <button class="btn-primary" :disabled="working" data-testid="mkdir-confirm" @click="createFolder">Create folder</button>
      </template>
    </Modal>

    <Modal :open="Boolean(renameEntry)" title="Rename" :subtitle="renameEntry?.path" @close="renameEntry = null">
      <label class="label" for="rename-name">New name</label>
      <input id="rename-name" v-model.trim="renameName" class="input" data-testid="rename-name" @keyup.enter="rename" />
      <p v-if="dialogError" class="mt-2 text-sm text-coral-500">{{ dialogError }}</p>
      <template #footer>
        <button class="btn-secondary" @click="renameEntry = null">Cancel</button>
        <button class="btn-primary" :disabled="working" data-testid="rename-confirm" @click="rename">Rename</button>
      </template>
    </Modal>

    <Modal :open="Boolean(deleteEntry)" title="Delete" :subtitle="deleteEntry?.path" @close="deleteEntry = null">
      <p class="text-sm leading-relaxed">
        Delete <strong>{{ deleteEntry?.name }}</strong>? This cannot be undone.
      </p>
      <label v-if="deleteEntry?.type === 'directory'" class="mt-4 flex items-start gap-2 rounded-xl border border-coral-500/30 bg-coral-100/60 p-3 text-xs text-coral-500">
        <input v-model="deleteRecursive" type="checkbox" class="mt-0.5" data-testid="delete-recursive" />
        Delete this folder and everything inside it.
      </label>
      <p v-if="dialogError" class="mt-2 text-sm text-coral-500">{{ dialogError }}</p>
      <template #footer>
        <button class="btn-secondary" @click="deleteEntry = null">Cancel</button>
        <button class="btn-danger" :disabled="working" data-testid="delete-confirm" @click="removeEntry">Delete</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-vue-next';
import Modal from '../components/Modal.vue';
import { api, formatBytes } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const roots = ref([]);
const rootId = ref('0');
const path = ref('');
const entries = ref([]);
const loading = ref(true);
const error = ref('');
const uploading = ref(false);
const fileInput = ref(null);

const mkdirOpen = ref(false);
const mkdirName = ref('');
const renameEntry = ref(null);
const renameName = ref('');
const deleteEntry = ref(null);
const deleteRecursive = ref(false);
const dialogError = ref('');
const working = ref(false);

const currentRoot = computed(() => roots.value.find((r) => r.id === rootId.value));
const breadcrumbs = computed(() => {
  const segments = path.value.split('/').filter(Boolean);
  let cumulative = '';
  return segments.map((name) => {
    cumulative = cumulative ? `${cumulative}/${name}` : name;
    return { name, path: cumulative };
  });
});

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function loadRoots() {
  const data = await api('/files/roots');
  roots.value = data.roots;
  if (!roots.value.some((r) => String(r.id) === rootId.value)) rootId.value = roots.value[0]?.id || '0';
}

async function load() {
  loading.value = true;
  try {
    const data = await api('/files', { query: { root: rootId.value, path: path.value } });
    entries.value = data.items;
    error.value = '';
  } catch (err) {
    error.value = err.message;
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

function navigate(nextPath) {
  path.value = nextPath;
  load();
}

function changeRoot() {
  path.value = '';
  load();
}

function downloadUrl(target) {
  return `/api/files/download?root=${encodeURIComponent(rootId.value)}&path=${encodeURIComponent(target)}`;
}

async function onUpload(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    await api('/files/upload', { method: 'POST', form, query: { root: rootId.value, path: path.value } });
    toast(`${file.name} uploaded.`);
    await load();
  } catch (err) {
    toast(err.message, 'error', 7000);
  } finally {
    uploading.value = false;
  }
}

function openMkdir() {
  mkdirName.value = '';
  dialogError.value = '';
  mkdirOpen.value = true;
}

async function createFolder() {
  working.value = true;
  dialogError.value = '';
  try {
    await api('/files/mkdir', { method: 'POST', body: { root: rootId.value, path: path.value, name: mkdirName.value } });
    toast('Folder created.');
    mkdirOpen.value = false;
    await load();
  } catch (err) {
    dialogError.value = err.message;
  } finally {
    working.value = false;
  }
}

function openRename(entry) {
  renameEntry.value = entry;
  renameName.value = entry.name;
  dialogError.value = '';
}

async function rename() {
  working.value = true;
  dialogError.value = '';
  try {
    await api('/files/rename', { method: 'POST', body: { root: rootId.value, path: renameEntry.value.path, name: renameName.value } });
    toast('Renamed.');
    renameEntry.value = null;
    await load();
  } catch (err) {
    dialogError.value = err.message;
  } finally {
    working.value = false;
  }
}

function openDelete(entry) {
  deleteEntry.value = entry;
  deleteRecursive.value = false;
  dialogError.value = '';
}

async function removeEntry() {
  working.value = true;
  dialogError.value = '';
  try {
    await api('/files/delete', {
      method: 'POST',
      body: { root: rootId.value, path: deleteEntry.value.path, recursive: deleteRecursive.value },
    });
    toast('Deleted.');
    deleteEntry.value = null;
    await load();
  } catch (err) {
    dialogError.value = err.message;
  } finally {
    working.value = false;
  }
}

onMounted(async () => {
  try {
    await loadRoots();
    await load();
  } catch (err) {
    error.value = err.message;
    loading.value = false;
  }
});
</script>
