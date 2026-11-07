import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError } from '../errors.js';
import {
  appDataIdFor,
  projectName,
  safeAppId,
  translateCompose,
} from './compose.js';
import {
  deleteApp as deleteAppRow,
  getApp as getAppRow,
  getAppByStoreId,
  insertApp,
  listApps,
} from '../db.js';
import { isPortFree } from './docker.js';

const HOST_ARCH = process.arch === 'x64' ? 'amd64' : process.arch;
const HEALTH_WEIGHT = { healthy: 0, starting: 1, unhealthy: 2 };

export class AppService {
  constructor({ db, docker, store, settings, config, logger = console }) {
    this.db = db;
    this.docker = docker;
    this.store = store;
    this.settings = settings;
    this.config = config;
    this.logger = logger;
  }

  statusOf(app, allContainers) {
    const containers = allContainers.filter((c) => c.labels?.['cabana.app.id'] === app.id);
    let status = 'missing';
    if (containers.length) {
      if (containers.some((c) => ['restarting', 'dead'].includes(c.state))) status = 'error';
      else if (containers.some((c) => c.state === 'running')) status = 'running';
      else status = 'stopped';
    }
    const main = containers.find((c) => c.labels?.['cabana.app.service'] === app.mainService);
    let health = null;
    if (status === 'running') {
      const healthValues = containers.map((c) => c.health).filter(Boolean);
      if (main?.health) health = main.health;
      else if (healthValues.length) health = healthValues.sort((a, b) => (HEALTH_WEIGHT[a] ?? 9) - (HEALTH_WEIGHT[b] ?? 9))[0];
      else health = 'none';
    }
    return {
      status,
      health,
      containers: containers.map((c) => ({
        name: c.name,
        service: c.labels?.['cabana.app.service'] || null,
        image: c.image,
        state: c.state,
        health: c.health,
        statusText: c.statusText,
        ports: c.portBindings,
      })),
    };
  }

  serialize(app, runtime) {
    return {
      id: app.id,
      title: app.title,
      source: app.source,
      storeId: app.storeId,
      version: app.version,
      iconPath: app.icon || null,
      mainService: app.mainService,
      scheme: app.scheme,
      port: app.portMap,
      index: app.urlPath || '/',
      status: runtime.status,
      health: runtime.health,
      containers: runtime.containers,
      createdAt: app.createdAt,
      warnings: app.warnings || [],
    };
  }

  async list({ force = false } = {}) {
    const apps = listApps(this.db);
    const dockerInfo = await this.docker.info({ force });
    let containers = [];
    if (dockerInfo.available) {
      try {
        containers = await this.docker.listContainers({ force });
      } catch (error) {
        this.logger.warn?.(`could not list containers: ${error.message}`);
      }
    }
    const serialized = apps.map((app) => this.serialize(app, this.statusOf(app, containers)));
    const orphans = dockerInfo.available
      ? containers
          .filter((c) => c.labels?.['cabana.managed'] === 'true' && !apps.some((a) => a.id === c.labels?.['cabana.app.id']))
          .map((c) => ({
            name: c.name,
            appId: c.labels?.['cabana.app.id'] || null,
            state: c.state,
            statusText: c.statusText,
          }))
      : [];
    return { apps: serialized, orphans, docker: dockerInfo };
  }

  async get(id) {
    const app = getAppRow(this.db, id);
    if (!app) throw new AppError(404, 'app_not_found', 'App not found.');
    const info = await this.docker.info();
    let containers = [];
    if (info.available) containers = await this.docker.listContainers({ force: true }).catch(() => []);
    return { app: this.serialize(app, this.statusOf(app, containers)), docker: info };
  }

  composePathFor(appId) {
    return path.join(this.config.appsDir, appId, 'docker-compose.yml');
  }

  async writeCompose(appId, yamlText) {
    const dir = path.dirname(this.composePathFor(appId));
    fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
    const file = path.join(dir, 'docker-compose.yml');
    const tmp = path.join(dir, `.compose.${crypto.randomBytes(4).toString('hex')}.tmp`);
    fs.writeFileSync(tmp, yamlText, { mode: 0o640 });
    fs.renameSync(tmp, file);
    return file;
  }

  async validatePorts(translated, { existingAppId = null } = {}) {
    const containers = await this.docker.listContainers({ force: true }).catch(() => []);
    const occupied = new Map();
    for (const container of containers) {
      if (container.state !== 'running') continue;
      if (existingAppId && container.labels?.['cabana.app.id'] === existingAppId) continue;
      for (const binding of container.portBindings) {
        occupied.set(String(binding.hostPort), container.name);
      }
    }
    const conflicts = [];
    const seen = new Set();
    for (const p of translated.hostPorts) {
      if (!p.hostPort || seen.has(p.hostPort)) continue;
      seen.add(p.hostPort);
      if (occupied.has(p.hostPort)) {
        conflicts.push({ port: p.hostPort, reason: `already published by container "${occupied.get(p.hostPort)}"` });
        continue;
      }
      if (!(await isPortFree(Number(p.hostPort)))) {
        conflicts.push({ port: p.hostPort, reason: 'already in use by another process on the host' });
      }
    }
    return conflicts;
  }

  async validateNames(translated, { existingAppId = null } = {}) {
    const containers = await this.docker.listContainers({ force: true }).catch(() => []);
    const conflicts = [];
    for (const name of translated.containerNames) {
      const found = containers.find((c) => c.name === name);
      if (found && found.labels?.['cabana.app.id'] !== existingAppId) {
        conflicts.push({ name, reason: `container name is already used by "${found.name}"` });
      }
    }
    const projectContainers = containers.filter(
      (c) => c.labels?.['com.docker.compose.project'] === translated.project &&
        c.labels?.['cabana.app.id'] !== existingAppId,
    );
    if (projectContainers.length) {
      conflicts.push({
        name: translated.project,
        reason: `Compose project "${translated.project}" already has containers (${projectContainers
          .map((c) => c.name)
          .join(', ')})`,
      });
    }
    return conflicts;
  }

  async preflight(translated, options) {
    const nameConflicts = await this.validateNames(translated, options);
    if (nameConflicts.length) {
      throw new AppError(409, 'container_name_conflict', `Cannot install because a container name conflicts: ${nameConflicts
        .map((c) => c.reason)
        .join('; ')}`, { conflicts: nameConflicts });
    }
    const portConflicts = await this.validatePorts(translated, options);
    if (portConflicts.length) {
      throw new AppError(409, 'port_conflict', `Cannot install because a required host port is busy: ${portConflicts
        .map((c) => `${c.port} (${c.reason})`)
        .join('; ')}`, { conflicts: portConflicts });
    }
  }

  async installStore(storeId, { force = false } = {}) {
    await this.docker.requireAvailable();
    if (!safeAppId(storeId)) throw new AppError(400, 'invalid_app_id', 'Invalid store app id.');
    const settings = this.settings.get();
    if (getAppByStoreId(this.db, storeId)) {
      throw new AppError(409, 'already_installed', 'That app is already installed.');
    }
    const index = await this.store.getIndex();
    const entry = await this.store.getApp(index, storeId);
    if (!entry.architectures.includes(HOST_ARCH)) {
      throw new AppError(
        409,
        'unsupported_architecture',
        `${entry.title} does not publish an image for this host architecture (${HOST_ARCH}).`,
      );
    }
    const compose = await this.store.getCompose(entry, HOST_ARCH, { force });
    const appDataId = appDataIdFor(entry.id);
    const project = projectName(entry.id);
    const translated = translateCompose(compose.text, {
      appId: entry.id,
      appDataId,
      title: entry.title,
      source: 'store',
      project,
      puid: settings.puid,
      pgid: settings.pgid,
      tz: settings.tz,
      dataDir: this.config.dataDir,
    });
    translated.warnings.push({
      code: 'store_source',
      service: null,
      message: 'App definition from the official CasaOS/ZimaOS app store. Cabana is not affiliated with CasaOS or ZimaOS.',
    });
    await this.preflight(translated);
    const composePath = await this.writeCompose(entry.id, translated.yaml);
    try {
      await this.docker.up(project, composePath);
    } catch (error) {
      await this.docker.down(project, composePath).catch(() => {});
      throw error;
    }
    const app = insertApp(this.db, {
      id: entry.id,
      project,
      title: entry.title,
      source: 'store',
      storeId: entry.id,
      version: entry.version,
      composePath,
      mainService: translated.mainService,
      scheme: translated.scheme,
      portMap: translated.portMap,
      urlPath: translated.index,
      icon: entry.iconPath,
      dataPaths: translated.dataPaths,
      containerNames: translated.containerNames,
      warnings: translated.warnings,
    });
    const info = await this.docker.info({ force: true });
    let containers = [];
    if (info.available) containers = await this.docker.listContainers({ force: true }).catch(() => []);
    return this.serialize(app, this.statusOf(app, containers));
  }

  async previewStore(storeId) {
    const index = await this.store.getIndex();
    const entry = await this.store.getApp(index, storeId);
    const settings = this.settings.get();
    const preview = { port: null, scheme: 'http', index: '/', mainService: null, warnings: [] };
    try {
      const compose = await this.store.getCompose(entry, HOST_ARCH);
      const translated = translateCompose(compose.text, {
        appId: entry.id,
        appDataId: appDataIdFor(entry.id),
        title: entry.title,
        source: 'store',
        project: projectName(entry.id),
        puid: settings.puid,
        pgid: settings.pgid,
        tz: settings.tz,
        dataDir: this.config.dataDir,
      });
      preview.port = translated.portMap;
      preview.scheme = translated.scheme;
      preview.index = translated.index;
      preview.mainService = translated.mainService;
      preview.warnings = translated.warnings;
    } catch (error) {
      preview.warning = `Could not read the published Compose definition: ${error.message}`;
    }
    return { ...entry, ...preview, portMap: preview.port };
  }

  async analyzeCustom({ compose, title }) {    if (typeof compose !== 'string' || !compose.trim()) {
      throw new AppError(400, 'compose_required', 'Paste a Docker Compose file to continue.');
    }
    if (compose.length > 512 * 1024) throw new AppError(400, 'compose_too_large', 'Compose file is too large (max 512 KB).');
    const settings = this.settings.get();
    const appDataId = this.uniqueAppId(title || 'custom-app');
    const project = projectName(appDataId);
    const translated = translateCompose(compose, {
      appId: appDataId,
      appDataId,
      title: title || 'Custom app',
      source: 'custom',
      project,
      puid: settings.puid,
      pgid: settings.pgid,
      tz: settings.tz,
      dataDir: this.config.dataDir,
    });
    const dangerous = translated.warnings.filter((w) =>
      ['privileged', 'host_network', 'host_pid', 'host_ipc', 'cap_add', 'devices', 'docker_socket', 'sensitive_mount'].includes(w.code),
    );
    return {
      id: appDataId,
      project,
      services: Object.keys(translated.doc.services),
      mainService: translated.mainService,
      port: translated.portMap,
      scheme: translated.scheme,
      index: translated.index,
      containerNames: translated.containerNames,
      warnings: translated.warnings,
      needsConfirmation: dangerous.length > 0,
      requiresConfirmation: dangerous.length > 0,
    };
  }

  uniqueAppId(title) {
    let base = String(title || 'custom-app')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    if (!base || !/^[a-z0-9]/.test(base)) base = `custom-${crypto.randomBytes(3).toString('hex')}`;
    if (!getAppRow(this.db, base)) return base;
    for (let i = 2; i < 100; i += 1) {
      if (!getAppRow(this.db, `${base}-${i}`)) return `${base}-${i}`;
    }
    return `${base}-${crypto.randomBytes(3).toString('hex')}`;
  }

  async installCustom({ compose, title, confirmRisk = false, id: requestedId = null }) {
    await this.docker.requireAvailable();
    if (typeof compose !== 'string' || !compose.trim()) {
      throw new AppError(400, 'compose_required', 'Paste a Docker Compose file to continue.');
    }
    if (compose.length > 512 * 1024) throw new AppError(400, 'compose_too_large', 'Compose file is too large (max 512 KB).');
    const settings = this.settings.get();
    let appId = requestedId ? safeAppId(requestedId) : null;
    if (requestedId && !appId) throw new AppError(400, 'invalid_app_id', 'Invalid app id.');
    if (!appId || getAppRow(this.db, appId)) appId = this.uniqueAppId(title || requestedId || 'custom-app');
    const project = projectName(appId);
    const translated = translateCompose(compose, {
      appId,
      appDataId: appId,
      title: title || 'Custom app',
      source: 'custom',
      project,
      puid: settings.puid,
      pgid: settings.pgid,
      tz: settings.tz,
      dataDir: this.config.dataDir,
    });
    const dangerous = translated.warnings.filter((w) =>
      ['privileged', 'host_network', 'host_pid', 'host_ipc', 'cap_add', 'devices', 'docker_socket', 'sensitive_mount'].includes(w.code),
    );
    if (dangerous.length && !confirmRisk) {
      throw new AppError(
        409,
        'confirmation_required',
        'This Compose file requests elevated host access. Confirm the risk before installing.',
        { warnings: dangerous },
      );
    }
    translated.warnings.push({
      code: 'custom_source',
      service: null,
      message: 'Custom Compose file imported by the administrator. Cabana does not vet custom app images.',
    });
    await this.preflight(translated);
    const composePath = await this.writeCompose(appId, translated.yaml);
    try {
      await this.docker.up(project, composePath);
    } catch (error) {
      await this.docker.down(project, composePath).catch(() => {});
      throw error;
    }
    const app = insertApp(this.db, {
      id: appId,
      project,
      title: title || 'Custom app',
      source: 'custom',
      version: null,
      composePath,
      mainService: translated.mainService,
      scheme: translated.scheme,
      portMap: translated.portMap,
      urlPath: translated.index,
      icon: null,
      dataPaths: translated.dataPaths,
      containerNames: translated.containerNames,
      warnings: translated.warnings,
    });
    const info = await this.docker.info({ force: true });
    let containers = [];
    if (info.available) containers = await this.docker.listContainers({ force: true }).catch(() => []);
    return this.serialize(app, this.statusOf(app, containers));
  }

  async start(id) {
    await this.docker.requireAvailable();
    const app = getAppRow(this.db, id);
    if (!app) throw new AppError(404, 'app_not_found', 'App not found.');
    if (!fs.existsSync(app.composePath)) throw new AppError(409, 'compose_missing', 'The stored Compose file is missing.');
    await this.docker.up(app.project, app.composePath);
    return this.get(id);
  }

  async stop(id) {
    await this.docker.requireAvailable();
    const app = getAppRow(this.db, id);
    if (!app) throw new AppError(404, 'app_not_found', 'App not found.');
    if (!fs.existsSync(app.composePath)) throw new AppError(409, 'compose_missing', 'The stored Compose file is missing.');
    await this.docker.stop(app.project, app.composePath);
    return this.get(id);
  }

  async uninstall(id, { deleteData = false } = {}) {
    const app = getAppRow(this.db, id);
    if (!app) throw new AppError(404, 'app_not_found', 'App not found.');
    const info = await this.docker.info();
    if (!info.available) throw new AppError(503, 'docker_unavailable', 'Docker must be available to uninstall an app.');
    if (fs.existsSync(app.composePath)) {
      await this.docker.down(app.project, app.composePath, { deleteVolumes: Boolean(deleteData) });
    } else {
      const containers = await this.docker.listContainers({ force: true });
      for (const container of containers.filter((c) => c.labels?.['cabana.app.id'] === app.id)) {
        await this.docker.runner('docker', ['rm', '-f', container.id], { timeout: 60_000 });
      }
      this.docker.invalidate();
    }
    const removed = [];
    if (deleteData) {
      const extra = path.join(this.config.dataDir, 'AppData', appDataIdFor(app.storeId || app.id, app.source === 'custom' ? app.id : null));
      const candidates = new Set([...app.dataPaths, extra, path.join(this.config.appsDir, app.id)]);
      const otherApps = listApps(this.db).filter((a) => a.id !== app.id);
      for (const candidate of candidates) {
        if (this.isSharedDataPath(candidate, otherApps)) continue;
        if (await this.removeDataPath(candidate)) removed.push(candidate);
      }
    }
    deleteAppRow(this.db, app.id);
    return { removed: true, dataDeleted: Boolean(deleteData), removedPaths: removed, dataPreserved: !deleteData };
  }

  isSharedDataPath(candidate, otherApps) {
    const normalized = path.posix.normalize(candidate);
    for (const other of otherApps) {
      for (const otherPath of other.dataPaths || []) {
        const p = path.posix.normalize(otherPath);
        if (normalized === p || p.startsWith(normalized + '/') || normalized.startsWith(p + '/')) return true;
      }
    }
    return false;
  }

  async removeDataPath(candidate) {
    const lexicalRoot = path.resolve(this.config.dataDir);
    const lexical = path.resolve(candidate);
    if (lexical === lexicalRoot || !lexical.startsWith(lexicalRoot + path.sep)) {
      // Also allow paths supplied in canonical form when the configured root is
      // reached through a symlink (for example /var -> /private/var on macOS).
      let realRootForCheck;
      try {
        realRootForCheck = await fsp.realpath(lexicalRoot);
      } catch {
        return false;
      }
      if (lexical === realRootForCheck || !lexical.startsWith(realRootForCheck + path.sep)) return false;
    }
    let dataRoot;
    try {
      dataRoot = await fsp.realpath(lexicalRoot);
    } catch {
      return false;
    }
    let stat;
    try {
      stat = await fsp.lstat(lexical);
    } catch {
      return false;
    }
    if (stat.isSymbolicLink()) {
      await fsp.unlink(lexical).catch(() => {});
      return true;
    }
    let real;
    try {
      real = await fsp.realpath(lexical);
    } catch {
      return false;
    }
    const realOfLexicalRoot = dataRoot;
    if (!real.startsWith(realOfLexicalRoot + path.sep)) return false;
    await fsp.rm(real, { recursive: true, force: true });
    return true;
  }
}
