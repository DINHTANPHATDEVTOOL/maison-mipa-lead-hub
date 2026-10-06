/**
 * Authenticated API Fetcher for Maison MIPA Client Components
 * Zero-friction direct access mode: automatically attaches master permissions
 * so the user can open and run the tool directly without login prompts or password walls.
 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});

  // Direct tool master authorization by default
  if (!headers.has('Authorization')) {
    headers.set('Authorization', 'Bearer direct-master-token');
  }
  if (!headers.has('x-direct-tool')) {
    headers.set('x-direct-tool', 'true');
  }
  if (!headers.has('x-user-role')) {
    headers.set('x-user-role', 'admin');
  }

  return fetch(url, {
    ...init,
    headers,
  });
}
