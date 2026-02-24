export const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3000';
const TOKEN_KEY = 'awt_token';
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 1 day before expiry

let refreshPromise: Promise<void> | null = null;

function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function refreshTokenIfNeeded(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;

  const expiry = getTokenExpiry(token);
  if (!expiry) return;

  const timeLeft = expiry - Date.now();
  if (timeLeft > REFRESH_THRESHOLD_MS) return;
  if (timeLeft <= 0) return; // Already expired, let the 401 handler deal with it

  // Deduplicate concurrent refresh calls
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json() as { token: string };
        localStorage.setItem(TOKEN_KEY, data.token);
      }
    } catch {
      // Silent fail — next request will use existing token
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown> | null;
  constructor(status: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data ?? null;
  }
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  // Attempt token refresh before the actual request (non-blocking for refresh endpoint itself)
  if (!endpoint.includes('/auth/refresh')) {
    await refreshTokenIfNeeded();
  }

  const { method = 'GET', body } = options;
  const token = localStorage.getItem(TOKEN_KEY);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    cache: 'no-store',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    // On 401, clear token and redirect to login (prevents flash-of-error on protected pages)
    if (response.status === 401 && !endpoint.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
      // Return a never-resolving promise so callers don't process the error
      return new Promise<T>(() => {});
    }

    let message = 'Request failed';
    let data: Record<string, unknown> | null = null;
    try {
      const parsed = await response.json() as Record<string, unknown>;
      message = (
        parsed.error ??
        parsed.message ??
        (Array.isArray(parsed.errors) ? (parsed.errors as Array<{ msg?: string }>)[0]?.msg : null) ??
        message
      ) as string;
      data = parsed;
    } catch { /* ignore */ }
    throw new ApiError(response.status, message, data ?? undefined);
  }

  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body: unknown, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'POST', body, headers }),
  put: <T>(endpoint: string, body: unknown, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'PUT', body, headers }),
  patch: <T>(endpoint: string, body: unknown, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'PATCH', body, headers }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};
