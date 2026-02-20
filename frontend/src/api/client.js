import { matchMockRoute } from './mockData';

const API_URL = import.meta.env.VITE_API_URL || '';
const USE_MOCKS = !API_URL;

let getToken = () => null;

export function setTokenGetter(fn) {
  getToken = fn;
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
    const body = options.body ? JSON.parse(options.body) : undefined;
    return mockRequest(method, path, body);
  }

  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
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
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
