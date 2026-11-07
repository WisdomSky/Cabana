import path from 'node:path';
import YAML from 'yaml';
import { AppError } from '../errors.js';

const VARIABLE_RE = /\$\{(AppID|PUID|PGID|TZ)(?::-([^}]*))?\}|\$(AppID|PUID|PGID|TZ)\b/g;

export function substituteCasaVariables(text, { appId, puid = 1000, pgid = 1000, tz = 'UTC' }) {
  const values = { AppID: appId, PUID: String(puid), PGID: String(pgid), TZ: tz || 'UTC' };
  return String(text).replace(VARIABLE_RE, (_match, braced, fallback, bare) => {
    const key = braced || bare;
    const value = values[key];
    if (value === undefined || value === '') return fallback ?? '';
    return value;
  });
}

export function parseComposeYaml(text) {
  let doc;
  try {
    doc = YAML.parse(text, { maxAliasCount: 100 });
  } catch (error) {
    throw new AppError(400, 'invalid_compose', `The Compose file is not valid YAML: ${error.message}`);
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new AppError(400, 'invalid_compose', 'The Compose file must contain a YAML mapping.');
  }
  if (!doc.services || typeof doc.services !== 'object' || Array.isArray(doc.services)) {
    throw new AppError(400, 'invalid_compose', 'The Compose file must define at least one service.');
  }
  const services = Object.entries(doc.services);
  if (!services.length) throw new AppError(400, 'invalid_compose', 'The Compose file must define at least one service.');
  for (const [name, service] of services) {
    if (!service || typeof service !== 'object' || Array.isArray(service)) {
      throw new AppError(400, 'invalid_compose', `Service "${name}" must be a mapping.`);
    }
    if (service.build) {
      throw new AppError(
        400,
        'compose_build_unsupported',
        `Service "${name}" uses "build". Cabana installs container images from registries; source builds are out of scope.`,
      );
    }
    if (!service.image || typeof service.image !== 'string') {
      throw new AppError(400, 'compose_image_required', `Service "${name}" must define an image.`);
    }
  }
  if ('include' in doc) {
    throw new AppError(400, 'compose_include_unsupported', 'Top-level "include" is not supported for imported Compose files.');
  }
  for (const [name, service] of services) {
    if (service.extends) {
      throw new AppError(400, 'compose_extends_unsupported', `Service "${name}" uses "extends", which is not supported.`);
    }
  }
  return doc;
}

export function analyzeCompose(doc) {
  const warnings = [];
  const services = Object.entries(doc.services);
  for (const [name, service] of services) {
    if (service.privileged === true) {
      warnings.push({ code: 'privileged', service: name, message: `Service "${name}" runs privileged and has full host-level capabilities.` });
    }
    if (String(service.network_mode || '').toLowerCase() === 'host') {
      warnings.push({ code: 'host_network', service: name, message: `Service "${name}" uses host networking and shares the host network stack.` });
    }
    if (String(service.pid || '').toLowerCase() === 'host') {
      warnings.push({ code: 'host_pid', service: name, message: `Service "${name}" uses the host PID namespace.` });
    }
    if (String(service.ipc || '').toLowerCase() === 'host') {
      warnings.push({ code: 'host_ipc', service: name, message: `Service "${name}" uses the host IPC namespace.` });
    }
    if (Array.isArray(service.cap_add) && service.cap_add.length) {
      warnings.push({ code: 'cap_add', service: name, message: `Service "${name}" adds Linux capabilities: ${service.cap_add.join(', ')}.` });
    }
    if (Array.isArray(service.devices) && service.devices.length) {
      warnings.push({ code: 'devices', service: name, message: `Service "${name}" maps host devices.` });
    }
    for (const volume of service.volumes || []) {
      const source = typeof volume === 'string' ? volume.split(':')[0] : volume?.source;
      if (!source) continue;
      if (source === '/var/run/docker.sock' || /\/docker\.sock$/.test(source)) {
        warnings.push({
          code: 'docker_socket',
          service: name,
          message: `Service "${name}" mounts the Docker socket, granting it root-equivalent control of the host.`,
        });
      }
      if (source === '/' || source === '/etc' || source === '/root' || source === '/boot') {
        warnings.push({
          code: 'sensitive_mount',
          service: name,
          message: `Service "${name}" mounts sensitive host path ${source}.`,
        });
      }
    }
    if (service.env_file) {
      warnings.push({ code: 'env_file', service: name, message: `Service "${name}" reads an env_file from the host.` });
    }
  }
  return warnings;
}

function normalizeLabels(labels) {
  if (Array.isArray(labels)) {
    const out = {};
    for (const entry of labels) {
      const idx = String(entry).indexOf('=');
      if (idx > 0) out[String(entry).slice(0, idx)] = String(entry).slice(idx + 1);
    }
    return out;
  }
  if (labels && typeof labels === 'object') return { ...labels };
  return {};
}

export function parsePublishedPorts(service) {
  const result = [];
  for (const entry of service.ports || []) {
    if (typeof entry === 'number') {
      result.push({ hostPort: null, containerPort: String(entry), protocol: 'tcp' });
      continue;
    }
    if (typeof entry === 'string') {
      const protocol = entry.endsWith('/udp') ? 'udp' : 'tcp';
      const clean = entry.replace(/\/(tcp|udp)$/, '');
      const parts = clean.split(':');
      if (parts.length === 1) {
        result.push({ hostPort: null, containerPort: parts[0], protocol });
      } else {
        const containerPort = parts[parts.length - 1];
        const hostPart = parts[parts.length - 2];
        const hostIp = parts.length > 2 ? parts.slice(0, -2).join(':') : '0.0.0.0';
        const range = expandPortRange(hostPart);
        for (const hostPort of range) result.push({ hostPort, containerPort, protocol, hostIp });
      }
      continue;
    }
    if (entry && typeof entry === 'object') {
      const protocol = entry.protocol || 'tcp';
      const containerPort = entry.target !== undefined ? String(entry.target) : null;
      const hostPort = entry.published !== undefined && entry.published !== null ? String(entry.published) : null;
      if (hostPort && /^\d+-\d+$/.test(hostPort)) {
        for (const p of expandPortRange(hostPort)) {
          result.push({ hostPort: p, containerPort, protocol, hostIp: entry.host_ip || '0.0.0.0' });
        }
      } else {
        result.push({ hostPort, containerPort, protocol, hostIp: entry.host_ip || '0.0.0.0' });
      }
    }
  }
  return result;
}

function expandPortRange(value) {
  const str = String(value);
  if (/^\d+$/.test(str)) return [String(Number(str))];
  const match = /^(\d+)-(\d+)$/.exec(str);
  if (!match) return [];
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end < start || end - start > 100) return [];
  const out = [];
  for (let p = start; p <= end; p += 1) out.push(String(p));
  return out;
}

export function extractDataPaths(doc, dataDir = '/DATA') {
  const found = new Set();
  for (const service of Object.values(doc.services)) {
    for (const volume of service.volumes || []) {
      const source = typeof volume === 'string' ? volume.split(':')[0] : volume?.source;
      if (typeof source !== 'string') continue;
      if (source === dataDir || source.startsWith(`${dataDir}/`)) {
        found.add(path.posix.normalize(source));
      } else if (dataDir === '/DATA' && (source === '/DATA' || source.startsWith('/DATA/'))) {
        found.add(path.posix.normalize(source));
      }
    }
  }
  return [...found].filter((p) => p !== '/DATA' && p !== dataDir);
}

function pickPort(service) {
  const ports = parsePublishedPorts(service);
  const withHost = ports.filter((p) => p.hostPort);
  if (!withHost.length) return null;
  return withHost[0].hostPort;
}

export function translateCompose(text, options) {
  const {
    appId,
    appDataId,
    title,
    source = 'custom',
    puid = 1000,
    pgid = 1000,
    tz = 'UTC',
    project,
    dataDir = '/DATA',
  } = options;

  const substituted = substituteCasaVariables(text, { appId: appDataId, puid, pgid, tz });
  const doc = parseComposeYaml(substituted);
  if (dataDir && dataDir !== '/DATA') {
    for (const service of Object.values(doc.services)) {
      service.volumes = (service.volumes || []).map((volume) => {
        if (typeof volume === 'string') {
          const idx = volume.indexOf(':');
          if (idx <= 0) return volume;
          const sourcePath = volume.slice(0, idx);
          if (sourcePath === '/DATA' || sourcePath.startsWith('/DATA/')) {
            return `${dataDir}${sourcePath.slice(5)}${volume.slice(idx)}`;
          }
          return volume;
        }
        if (volume && typeof volume === 'object' && typeof volume.source === 'string') {
          if (volume.source === '/DATA' || volume.source.startsWith('/DATA/')) {
            volume.source = `${dataDir}${volume.source.slice(5)}`;
          }
        }
        return volume;
      });
    }
  }

  const xCasa = doc['x-casaos'] && typeof doc['x-casaos'] === 'object' ? doc['x-casaos'] : {};
  const serviceNames = Object.keys(doc.services);
  const mainService =
    (typeof xCasa.main === 'string' && serviceNames.includes(xCasa.main) && xCasa.main) || serviceNames[0];

  for (const [name, service] of Object.entries(doc.services)) {
    const labels = normalizeLabels(service.labels);
    labels['cabana.managed'] = 'true';
    labels['cabana.app.id'] = appId;
    labels['cabana.app.source'] = source;
    labels['cabana.app.service'] = name;
    service.labels = labels;
    if (!service.container_name) {
      service.container_name = `${project}-${name}`.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 60);
    }
    if (!service.restart) service.restart = 'unless-stopped';
  }

  const warnings = analyzeCompose(doc);
  const hostPorts = [];
  const servicePorts = {};
  for (const [name, service] of Object.entries(doc.services)) {
    const ports = parsePublishedPorts(service);
    servicePorts[name] = ports;
    for (const port of ports) {
      if (port.hostPort) {
        hostPorts.push(port);
        if (port.hostIp && !['0.0.0.0', '::', ''].includes(port.hostIp)) {
          warnings.push({
            code: 'loopback_port',
            service: name,
            message: `Service "${name}" publishes port ${port.hostPort} on ${port.hostIp} only; it may not be reachable from your LAN.`,
          });
        }
      } else {
        warnings.push({
          code: 'random_port',
          service: name,
          message: `Service "${name}" does not pin a host port; its address may change after a restart.`,
        });
      }
    }
  }

  const declaredPort = xCasa.port_map !== undefined ? String(xCasa.port_map) : null;
  let portMap = declaredPort && /^\d+$/.test(declaredPort) ? declaredPort : null;
  if (!portMap) portMap = pickPort(doc.services[mainService]) || hostPorts[0]?.hostPort || null;
  if (!portMap) {
    warnings.push({
      code: 'no_published_port',
      service: mainService,
      message: 'No published host port was found, so Cabana cannot derive an app URL.',
    });
  }

  const dataPaths = extractDataPaths(doc, dataDir);
  const containerNames = Object.values(doc.services)
    .map((service) => service.container_name)
    .filter(Boolean);

  const output = YAML.stringify(doc, { lineWidth: 0 });
  return {
    yaml: output,
    doc,
    appId,
    appDataId,
    title: title || xCasa.title?.en_US || serviceNames[0],
    project,
    mainService,
    scheme: xCasa.scheme === 'https' ? 'https' : 'http',
    portMap,
    index: typeof xCasa.index === 'string' && xCasa.index.startsWith('/') ? xCasa.index : '/',
    icon: typeof xCasa.icon === 'string' ? xCasa.icon : null,
    hostPorts,
    servicePorts,
    dataPaths,
    containerNames,
    warnings,
    xCasa,
  };
}

export function detectCustomWarnings(doc) {
  return analyzeCompose(doc);
}

export function safeAppId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,80}$/.test(value)) return null;
  return value;
}

export function projectName(appId) {
  const normalized = String(appId)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 50);
  return `cabana_${normalized}`.slice(0, 63);
}

export function appDataIdFor(storeId, customSlug) {
  if (customSlug) return customSlug;
  const last = String(storeId).split('.').filter(Boolean).pop() || 'app';
  return last.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
}
