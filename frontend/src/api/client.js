import { matchMockRoute } from './mockData';

const API_URL = import.meta.env.VITE_API_URL || '';
const USE_MOCKS = !API_URL;

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN || 'clienta-ai-prod.auth.us-east-1.amazoncognito.com';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';

let tokenGetter = () => null;
let onTokenRefreshed = null; // callback to sync new token into AuthContext

// Single in-flight refresh promise — prevents concurrent 401s from triggering multiple refreshes
let _refreshPromise = null;

export function setTokenGetter(fn) {
  tokenGetter = fn;
}

export function setOnTokenRefreshed(fn) {
  onTokenRefreshed = fn;
}

export function getTokenGetter() {
  return tokenGetter;
}

function getToken() {
  return tokenGetter() || _getTokenFromStorage();
}

function _getTokenFromStorage() {
  try {
    const keys = Object.keys(window.localStorage);
    const key = keys.find(k => k.includes('CognitoIdentityServiceProvider') && k.includes('idToken'));
    return key ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function _getRefreshTokenFromStorage() {
  try {
    const keys = Object.keys(window.localStorage);
    const lastUserKey = keys.find(k => k.includes('CognitoIdentityServiceProvider') && k.includes('LastAuthUser'));
    if (!lastUserKey) return null;
    const lastUser = window.localStorage.getItem(lastUserKey);
    const base = lastUserKey.replace('.LastAuthUser', '');
    return window.localStorage.getItem(`${base}.${lastUser}.refreshToken`);
  } catch {
    return null;
  }
}

function _saveTokenToStorage(idToken, accessToken) {
  try {
    const keys = Object.keys(window.localStorage);
    const lastUserKey = keys.find(k => k.includes('CognitoIdentityServiceProvider') && k.includes('LastAuthUser'));
    if (!lastUserKey) return;
    const lastUser = window.localStorage.getItem(lastUserKey);
    const base = lastUserKey.replace('.LastAuthUser', '');
    window.localStorage.setItem(`${base}.${lastUser}.idToken`, idToken);
    if (accessToken) window.localStorage.setItem(`${base}.${lastUser}.accessToken`, accessToken);
  } catch {
    // ignore storage errors
  }
}

async function _doRefresh() {
  const refreshTk = _getRefreshTokenFromStorage();
  if (!refreshTk || !CLIENT_ID || !COGNITO_DOMAIN) return null;
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
  _saveTokenToStorage(id_token, access_token);
  if (onTokenRefreshed) onTokenRefreshed(id_token);
  return id_token;
}

function refreshToken() {
  // Deduplicate concurrent refresh calls — all callers await the same promise
  if (!_refreshPromise) {
    _refreshPromise = _doRefresh().finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
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
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) return null;

  const body = await res.json().catch(() => null);

  if (res.status === 401 && _retry) {
    const newToken = await refreshToken();
    if (newToken) return request(path, options, false);
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
  postRaw: (path, body, contentType = 'text/csv') =>
    request(path, { method: 'POST', body, rawBody: true, headers: { 'Content-Type': contentType } }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
