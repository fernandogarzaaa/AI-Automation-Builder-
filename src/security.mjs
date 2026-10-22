import { ValidationError, publicHttpsUrl } from './spec.mjs';

export function allowedHosts(env = process.env) {
  return new Set((env.AAB_ALLOWED_ACTION_HOSTS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function assertDeployPolicy(spec, env = process.env) {
  const hosts = allowedHosts(env);
  if (hosts.size === 0) throw new ValidationError('Set AAB_ALLOWED_ACTION_HOSTS before deployment');
  for (const action of spec.actions) {
    const hostname = new URL(publicHttpsUrl(action.url)).hostname.toLowerCase();
    if (!hosts.has(hostname)) throw new ValidationError('Action host is not allowlisted: ' + hostname);
  }
}

export function n8nBaseUrl(env = process.env) {
  const raw = env.N8N_BASE_URL;
  if (!raw) throw new ValidationError('N8N_BASE_URL is required');
  let url;
  try { url = new URL(raw); } catch { throw new ValidationError('N8N_BASE_URL is invalid'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback && env.AAB_ALLOW_LOCAL_N8N === 'true'))) {
    throw new ValidationError('n8n must use HTTPS, or explicitly enabled HTTP loopback');
  }
  if (url.protocol === 'https:') publicHttpsUrl(url.toString(), 'N8N_BASE_URL');
  return url.origin + url.pathname.replace(/\/+$/, '');
}

export function safeError(error) {
  if (error instanceof ValidationError) return error.message;
  return 'Operation failed. Check provider configuration and server logs.';
}
