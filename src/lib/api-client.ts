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

  const response = await fetch(url, {
    ...init,
    headers,
  });

  // Safe json parser wrapper to prevent "Unexpected token '<', <!DOCTYPE..." crashes
  response.json = async () => {
    try {
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        const cleanMsg = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
        return {
          success: false,
          error: `Lỗi máy chủ (HTTP ${response.status}): ${cleanMsg || 'Không nhận được phản hồi JSON hợp lệ'}`,
        };
      }
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  return response;
}
