const TOKEN_KEY = 'auth_token';

// In production the frontend and backend are separate Azure Container Apps, so
// requests go to the backend's absolute URL and rely on CORS. That URL is
// injected at RUNTIME via window.__ENV__.API_URL (written by the container
// entrypoint from BACKEND_URL) — so the image is built once and points at the
// right backend without a rebuild. Falls back to the build-time VITE_API_URL,
// then to the relative `/api` path (local dev / same-origin, proxied by nginx/vite).
declare global {
  interface Window {
    __ENV__?: { API_URL?: string };
  }
}
const runtimeApiUrl =
  typeof window !== 'undefined' ? window.__ENV__?.API_URL : undefined;
const API_BASE = (
  runtimeApiUrl ||
  (import.meta.env.VITE_API_URL as string | undefined) ||
  ''
).replace(/\/+$/, '');
export const apiUrl = (path: string): string => (API_BASE ? `${API_BASE}${path}` : `/api${path}`);

// Authorization header for raw fetch() calls (exports, aborted previews) that
// don't go through the api client below.
export function authHeader(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetchBlob(path: string): Promise<Blob> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(apiUrl(path), { headers });
  if (response.status === 401) {
    clearStoredToken();
    window.location.href = '/auth';
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`API error ${response.status}: ${detail}`);
  }
  return response.blob();
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(apiUrl(path), { ...options, headers });

  if (response.status === 401) {
    clearStoredToken();
    window.location.href = '/auth';
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`API error ${response.status}: ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(apiUrl(path), { method: 'POST', body: formData, headers });
  if (response.status === 401) {
    clearStoredToken();
    window.location.href = '/auth';
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`API error ${response.status}: ${detail}`);
  }
  return response.json();
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => apiUpload<T>(path, formData),
  download: (path: string, filename: string) =>
    apiFetchBlob(path).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }),
};
