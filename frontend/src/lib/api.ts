// Central API helper — all authenticated requests flow through here.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

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
    const json = await res.json();
    if (!res.ok) return { data: null, error: json.error ?? 'Request failed' };
    return { data: json as T, error: null };
  } catch {
    return { data: null, error: 'Cannot connect to server' };
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
