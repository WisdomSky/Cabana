import fs from 'node:fs';
import os from 'node:os';

function readFileOr(file, fallback = '') {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}

function cpuTimes() {
  const stat = readFileOr('/proc/stat');
  const line = stat.split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return null;
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = values;
  const total = user + nice + system + idle + iowait + irq + softirq + steal;
  const busy = total - idle - iowait;
  return { total, busy };
}

function memInfo() {
  const raw = readFileOr('/proc/meminfo');
  const map = {};
  for (const line of raw.split('\n')) {
    const match = /^(\w+):\s+(\d+)/.exec(line);
    if (match) map[match[1]] = Number(match[2]) * 1024;
  }
  if (!map.MemTotal) return null;
  const total = map.MemTotal;
  const available = map.MemAvailable ?? map.MemFree ?? 0;
  return {
    total,
    available,
    used: Math.max(0, total - available),
    free: map.MemFree ?? 0,
    buffers: map.Buffers ?? 0,
    cached: map.Cached ?? 0,
    swapTotal: map.SwapTotal ?? 0,
    swapUsed: Math.max(0, (map.SwapTotal ?? 0) - (map.SwapFree ?? 0)),
  };
}

function netInfo() {
  const raw = readFileOr('/proc/net/dev');
  let rx = 0;
  let tx = 0;
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const iface = line.slice(0, idx).trim();
    if (iface === 'lo') continue;
    const fields = line.slice(idx + 1).trim().split(/\s+/).map(Number);
    rx += fields[0] || 0;
    tx += fields[8] || 0;
  }
  return { rx, tx };
}

function diskUsage(target) {
  try {
    const stats = fs.statfsSync(target);
    const total = stats.blocks * stats.bsize;
    const available = stats.bavail * stats.bsize;
    const used = total - stats.bfree * stats.bsize;
    return {
      path: target,
      total,
      used,
      available,
      percent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
    };
  } catch {
    return null;
  }
}

export function readMounts() {
  const raw = readFileOr('/proc/mounts');
  const entries = [];
  for (const line of raw.split('\n')) {
    const parts = line.split(' ');
    if (parts.length < 4) continue;
    const [device, mountpoint, fstype] = parts;
    const decoded = mountpoint.replace(/\\040/g, ' ').replace(/\\011/g, '\t');
    entries.push({ device, mountpoint: decoded, fstype });
  }
  return entries;
}

const PHYSICAL_FS = new Set([
  'ext2',
  'ext3',
  'ext4',
  'xfs',
  'btrfs',
  'zfs',
  'vfat',
  'exfat',
  'ntfs',
  'ntfs3',
  'f2fs',
  'jfs',
  'reiserfs',
  'bcachefs',
  'overlay',
]);

export function listFilesystems(dataDir) {
  const mounts = readMounts();
  const seen = new Set();
  const out = [];
  const push = (mountpoint, fstype, device) => {
    if (!mountpoint || seen.has(mountpoint)) return;
    const usage = diskUsage(mountpoint);
    if (!usage || usage.total <= 0) return;
    seen.add(mountpoint);
    out.push({ ...usage, mountpoint, fstype, device: device || '' });
  };
  for (const mount of mounts) {
    if (!PHYSICAL_FS.has(mount.fstype)) continue;
    if (mount.mountpoint.includes('/snap/')) continue;
    push(mount.mountpoint, mount.fstype, mount.device);
  }
  if (!seen.has('/')) push('/', 'unknown', '');
  if (dataDir) {
    const dataMount = mounts.find((m) => m.mountpoint === dataDir);
    push(dataDir, dataMount?.fstype || 'unknown', dataMount?.device || '');
  }
  out.sort((a, b) => {
    if (a.mountpoint === '/') return -1;
    if (b.mountpoint === '/') return 1;
    return a.mountpoint.localeCompare(b.mountpoint);
  });
  return out;
}

export class HostMetrics {
  constructor({ dataDir, intervalMs = 2000 } = {}) {
    this.dataDir = dataDir;
    this.intervalMs = intervalMs;
    this.prevCpu = cpuTimes();
    this.prevNet = netInfo();
    this.prevAt = Date.now();
    this.cpuPercent = 0;
    this.rxRate = 0;
    this.txRate = 0;
    this.timer = null;
    this.lastSnapshotAt = 0;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.sample(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  sample() {
    const now = Date.now();
    const cpu = cpuTimes();
    if (cpu && this.prevCpu) {
      const totalDelta = cpu.total - this.prevCpu.total;
      const busyDelta = cpu.busy - this.prevCpu.busy;
      if (totalDelta > 0) this.cpuPercent = Math.max(0, Math.min(100, (busyDelta / totalDelta) * 100));
    }
    const net = netInfo();
    if (net && this.prevNet && now > this.prevAt) {
      const seconds = (now - this.prevAt) / 1000;
      this.rxRate = Math.max(0, (net.rx - this.prevNet.rx) / seconds);
      this.txRate = Math.max(0, (net.tx - this.prevNet.tx) / seconds);
    }
    this.prevCpu = cpu || this.prevCpu;
    this.prevNet = net || this.prevNet;
    this.prevAt = now;
    this.lastSnapshotAt = now;
  }

  snapshot() {
    if (Date.now() - this.lastSnapshotAt > 1000) this.sample();
    const mem = memInfo();
    const net = this.prevNet;
    const cpus = os.cpus();
    const load = os.loadavg();
    return {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      uptime: os.uptime(),
      cpu: {
        usagePercent: Math.round(this.cpuPercent * 10) / 10,
        cores: cpus.length,
        model: cpus[0]?.model?.trim() || 'Unknown CPU',
        load1: Math.round(load[0] * 100) / 100,
        load5: Math.round(load[1] * 100) / 100,
        load15: Math.round(load[2] * 100) / 100,
      },
      memory: mem
        ? {
            total: mem.total,
            used: mem.used,
            available: mem.available,
            percent: mem.total ? Math.round((mem.used / mem.total) * 1000) / 10 : 0,
            swapTotal: mem.swapTotal,
            swapUsed: mem.swapUsed,
          }
        : (() => {
            const total = os.totalmem();
            const free = os.freemem();
            return {
              total,
              used: total - free,
              available: free,
              percent: total ? Math.round(((total - free) / total) * 1000) / 10 : 0,
              swapTotal: 0,
              swapUsed: 0,
            };
          })(),
      disk: diskUsage(this.dataDir) || diskUsage('/'),
      network: {
        rxBytes: net?.rx || 0,
        txBytes: net?.tx || 0,
        rxRate: Math.round(this.rxRate),
        txRate: Math.round(this.txRate),
      },
    };
  }
}
