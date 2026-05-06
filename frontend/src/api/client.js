import { matchMockRoute } from './mockData';

const API_URL = import.meta.env.VITE_API_URL || '';
const USE_MOCKS = !API_URL;

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN || 'clienta-ai-prod.auth.us-east-1.amazoncognito.com';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';

let tokenGetter = () => null;
let tokenSetter = null;

export function setTokenGetter(fn) {
  tokenGetter = fn;
}

export function setTokenSetter(fn) {
  tokenSetter = fn;
}

export function getTokenGetter() {
  return tokenGetter;
}

function getTokenFromStorage() {
  try {
    const keys = Object.keys(typeof window !== 'undefined' ? window.localStorage : {});
    const idTokenKey = keys.find(k => k.includes('CognitoIdentityServiceProvider') && k.includes('idToken'));
    return idTokenKey ? window.localStorage.getItem(idTokenKey) : null;
  } catch {
    return null;
  }
}

function getRefreshTokenFromStorage() {
  try {
    const keys = Object.keys(typeof window !== 'undefined' ? window.localStorage : {});
    const prefix = keys.find(k => k.includes('CognitoIdentityServiceProvider') && k.includes('LastAuthUser'));
    if (!prefix) return null;
    const lastUser = window.localStorage.getItem(prefix);
    const base = prefix.replace('.LastAuthUser', '');
    return window.localStorage.getItem(`${base}.${lastUser}.refreshToken`);
  } catch {
    return null;
  }
}

function getToken() {
  const token = tokenGetter();
  return token || getTokenFromStorage();
}

async function refreshToken() {
  const refreshTk = getRefreshTokenFromStorage();
  if (!refreshTk || !CLIENT_ID || !COGNITO_DOMAIN) return null;
  try {
    const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refreshTk,
      }).toString(),
    });
    if (!res.ok) return null;
    const { id_token, access_token } = await res.json();
    // Update localStorage
    const keys = Object.keys(window.localStorage);
    const lastUserKey = keys.find(k => k.includes('CognitoIdentityServiceProvider') && k.includes('LastAuthUser'));
    if (lastUserKey) {
      const lastUser = window.localStorage.getItem(lastUserKey);
      const base = lastUserKey.replace('.LastAuthUser', '');
      window.localStorage.setItem(`${base}.${lastUser}.idToken`, id_token);
      if (access_token) window.localStorage.setItem(`${base}.${lastUser}.accessToken`, access_token);
    }
    // Notify AuthContext so React state stays in sync
    if (tokenSetter) tokenSetter(id_token);
    return id_token;
  } catch {
    return null;
  }
}

function mockRequest(method, path, body) {
  const match = matchMockRoute(method, path);
  if (!match) {
    return Promise.reject(new Error(`No mock handler for ${method} ${path}`));
  }
  return match.handler(...match.params, body);
}

async function request(path, options = {}, _retry = true) {
  const method = (options.method || 'GET').toUpperCase();

  if (USE_MOCKS) {
    const body = options.rawBody ? options.body : (options.body ? JSON.parse(options.body) : undefined);
    return mockRequest(method, path, body);
  }

  const token = getToken();
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

  if (res.status === 401 && _retry) {
    const newToken = await refreshToken();
    if (newToken) {
      return request(path, options, false);
    }
    // Refresh failed — redirect to login
    window.location.href = '/login';
    return null;
  }

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
