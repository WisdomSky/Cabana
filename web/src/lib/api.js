let csrfToken = null;

export function setCsrfToken(token) {
  csrfToken = token || null;
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'request_failed', details = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildUrl(path, query) {
  const url = new URL(`/api${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function api(path, { method = 'GET', body, form, query, auth = true } = {}) {
  const headers = {};
  const options = { method, headers, credentials: 'same-origin' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (form) options.body = form;
  if (auth && csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  let response;
  try {
    response = await fetch(buildUrl(path, query), options);
  } catch {
    throw new ApiError('Cannot reach the Cabana server. Check that it is running.', { status: 0, code: 'network_error' });
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    if (response.status === 401 && !['/auth/me', '/auth/login', '/setup'].includes(path)) {
      window.dispatchEvent(new CustomEvent('cabana:unauthorized'));
    }
    const error = data?.error || {};
    throw new ApiError(error.message || `Request failed with status ${response.status}.`, {
      status: response.status,
      code: error.code || 'request_failed',
      details: error.details || null,
    });
  }
  return data;
}

export function formatBytes(bytes, digits = 1) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatRate(bytesPerSecond) {
  return `${formatBytes(bytesPerSecond || 0)}/s`;
}

export function formatUptime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function appUrl(app) {
  const scheme = app.scheme === 'https' ? 'https' : 'http';
  const port = app.port ? `:${app.port}` : '';
  const path = app.index && app.index !== '/' ? app.index : '/';
  return `${scheme}://${window.location.hostname}${port}${path}`;
}

export function iconUrl(iconPath) {
  return iconPath ? `/api/store/asset?path=${encodeURIComponent(iconPath)}` : null;
}

export function relativeTime(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return 'unknown';
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
