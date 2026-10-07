import { chromium, Browser, LaunchOptions } from 'playwright';
import fs from 'fs';

/**
 * Robust Playwright Browser Launcher
 * Prioritizes system Google Chrome / Chromium over bundled Playwright browsers,
 * ensuring high reliability in production environments where bundled browsers
 * may not be pre-downloaded.
 */
export async function launchBrowser(options: LaunchOptions = {}): Promise<Browser> {
  const baseArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--enable-features=EncryptedClientHello',
    '--dns-over-https-mode=secure',
    '--dns-over-https-templates=https://cloudflare-dns.com/dns-query',
  ];

  const userArgs = options.args || [];
  const mergedArgs = Array.from(new Set([...baseArgs, ...userArgs]));

  // 1. First priority: Launch with system Google Chrome via channel 'chrome'
  try {
    return await chromium.launch({
      ...options,
      channel: options.channel || 'chrome',
      args: mergedArgs,
    });
  } catch {
    // Fall through to other strategies
  }

  // 2. Second priority: Launch with known Linux/macOS/Windows system paths
  const knownBinaries = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean) as string[];

  for (const binPath of knownBinaries) {
    try {
      if (fs.existsSync(binPath)) {
        return await chromium.launch({
          ...options,
          executablePath: binPath,
          args: mergedArgs,
        });
      }
    } catch {
      // Continue to next binary candidate
    }
  }

  // 3. Third priority: Bundled Playwright Chromium
  return await chromium.launch({
    ...options,
    args: mergedArgs,
  });
}
