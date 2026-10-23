// Central API helper — all authenticated requests flow through here.
const rawBaseUrl = import.meta.env.VITE_API_URL || '';
// Force consistency — ensure BASE_URL doesn't end with a slash for clean concatenation
const urlMatch = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
// In production (single-origin), BASE_URL should be /api. In dev, it might be http://localhost:5001/api
const BASE_URL = urlMatch || '/api';

/**
 * Ledger stores relative paths like `/invoices/invoice_123.pdf`.
 * Opening that with `window.open` would hit the dev server (8080), not Express — use this helper.
 * If `VITE_API_URL` is set (e.g. `http://127.0.0.1:5001/api`), uses that host's origin + path.
 */
export function resolveInvoicePdfUrl(savedUrl: string | undefined | null): string {
  if (!savedUrl) return '';
  const u = String(savedUrl).trim();
  if (/^https?:\/\//i.test(u)) return u;
  const path = u.startsWith('/') ? u : `/${u}`;
  if (rawBaseUrl) {
    try {
      const origin = new URL(rawBaseUrl).origin;
      return `${origin}${path}`;
    } catch {
      return path;
    }
  }
  return path;
}

function getToken(): string {
  return localStorage.getItem('token') ?? '';
}

// ── JSON requests ─────────────────────────────────────────────────────────────
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
        ...(options.headers ?? {}),
      },
    });

    // Check if the response is JSON
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      console.warn(`⚠️ Non-JSON response from ${path}:`, text.substring(0, 100));
      return { data: null, error: res.ok ? 'Unexpected response format' : `Error ${res.status}` };
    }

    const json = await res.json();
    if (!res.ok) return { data: null, error: json.error ?? `Error ${res.status}` };
    return { data: json as T, error: null };
  } catch (err: any) {
    console.error(`❌ apiFetch failed for ${path}:`, err.message);
    return { data: null, error: 'Connection failed' };
  }
}

// ── FormData requests (file uploads + multipart fields) ───────────────────────
// ⚠️ Do NOT set Content-Type manually here — the browser must set it with the
//    correct multipart boundary for FormData to work.
export async function apiFormFetch<T>(
  path: string,
  formData: FormData
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) return { data: null, error: json.error ?? 'Request failed' };
    return { data: json as T, error: null };
  } catch {
    return { data: null, error: 'Cannot connect to server' };
  }
}
