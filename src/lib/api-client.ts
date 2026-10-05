/**
 * Authenticated API Fetcher for Maison MIPA Client Components
 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('mipa_token') : null;
  const role = typeof window !== 'undefined' ? localStorage.getItem('mipa_role') : null;

  const headers = new Headers(init?.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (role && !headers.has('x-user-role')) {
    headers.set('x-user-role', role);
  }

  return fetch(url, {
    ...init,
    headers,
  });
}
