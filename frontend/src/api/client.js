const API_URL = import.meta.env.VITE_API_URL || '';

let getToken = () => null;

export function setTokenGetter(fn) {
  getToken = fn;
}

async function request(path, options = {}) {
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
