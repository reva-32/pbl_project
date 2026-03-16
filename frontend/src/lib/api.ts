// Central helper so every page calls the API the same way
const BASE_URL = 'http://localhost:5000/api';

function getToken(): string {
  return localStorage.getItem('token') ?? '';
}

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
