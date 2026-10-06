import fs from 'fs';
import path from 'path';

/**
 * Lightweight environment variable loader for native CLI scripts & background workers
 * Loads .env and .env.local without requiring external runtime dependencies
 */
export function loadEnvFiles(): void {
  const envFiles = ['.env', '.env.local'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (process.env[key] === undefined) {
              process.env[key] = val;
            }
          }
        }
      } catch (err) {
        console.warn(`[Env] Không thể đọc tệp ${file}:`, err);
      }
    }
  }
}

// Auto-load on import
loadEnvFiles();
