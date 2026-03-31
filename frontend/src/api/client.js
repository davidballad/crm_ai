import { matchMockRoute } from './mockData';

const API_URL = import.meta.env.VITE_API_URL || '';
const USE_MOCKS = !API_URL;

let tokenGetter = () => null;

export function setTokenGetter(fn) {
  tokenGetter = fn;
}

export function getTokenGetter() {
  return tokenGetter;
}

// Fallback: read token directly from Cognito storage if state fails
function getTokenFromStorage() {
  try {
    const keys = Object.keys(typeof window !== 'undefined' ? window.localStorage : {});
    const idTokenKey = keys.find(k => k.includes('CognitoIdentityServiceProvider') && k.includes('idToken'));
    return idTokenKey ? window.localStorage.getItem(idTokenKey) : null;
  } catch {
    return null;
  }
}

function getToken() {
  const token = tokenGetter();
  return token || getTokenFromStorage();
}

function mockRequest(method, path, body) {
  const match = matchMockRoute(method, path);
  if (!match) {
    return Promise.reject(new Error(`No mock handler for ${method} ${path}`));
  }
  return match.handler(...match.params, body);
}

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();

  if (USE_MOCKS) {
    const body = options.rawBody ? options.body : (options.body ? JSON.parse(options.body) : undefined);
    return mockRequest(method, path, body);
  }

  const token = getToken(); // Now uses fallback to localStorage
  const headers = {
    ...(options.headers || {}),
    'Content-Type': options.headers?.['Content-Type'] ?? 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) return null;

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = body?.message || body?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return body;
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  /** POST with raw body (e.g. CSV). body is string, contentType defaults to text/csv. */
  postRaw: (path, body, contentType = 'text/csv') =>
    request(path, { method: 'POST', body, rawBody: true, headers: { 'Content-Type': contentType } }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
