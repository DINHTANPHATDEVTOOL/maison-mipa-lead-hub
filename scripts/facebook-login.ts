import '../src/lib/env';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { launchBrowser } from '../src/lib/browser';
import { authManager } from '../src/worker/auth';

const targetProfileId = process.argv[2] || 'dev-01';
const AUTH_DIR = path.join(process.cwd(), 'data', 'auth');
const STATUS_FILE = path.join(AUTH_DIR, `login_status_${targetProfileId}.json`);
const PID_FILE = path.join(AUTH_DIR, `login_pid_${targetProfileId}.txt`);

function updateStatus(status: 'launching' | 'waiting_login' | 'success' | 'closed' | 'error', message: string, userId?: string) {
  try {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      STATUS_FILE,
      JSON.stringify(
        {
          profileId: targetProfileId,
          status,
          message,
          userId,
          updatedAt: Date.now(),
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error('[Login] Lỗi ghi file trạng thái:', err);
  }
}

function cleanupPid() {
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  } catch {}
}

async function loginFacebook() {
  // Store PID for cancel/cleanup support
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(PID_FILE, String(process.pid));

  updateStatus('launching', `Đang khởi tạo trình duyệt Chrome cho thiết bị [${targetProfileId}]...`);

  console.log('================================================================');
  console.log(`  MAISON MIPA LEAD HUB - ĐĂNG NHẬP FACEBOOK CHO [${targetProfileId}]`);
  console.log('================================================================');
  console.log('\n[1] Đang mở trình duyệt Google Chrome có giao diện...');

  let browser;
  try {
    browser = await launchBrowser({
      headless: false,
    });
  } catch (err: any) {
    updateStatus('error', `Không thể mở Chrome: ${err.message}`);
    cleanupPid();
    throw err;
  }

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 850 },
    locale: 'vi-VN',
  });

  const page = await context.newPage();
  console.log('[2] Đang chuyển đến trang đăng nhập Facebook...');
  try {
    await page.goto('https://www.facebook.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
  } catch (err: any) {
    console.warn(`[Cảnh báo] Lỗi kết nối www.facebook.com (${err.message}), đang thử điều hướng qua https://fb.com...`);
    try {
      await page.goto('https://fb.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    } catch {
      await page.goto('https://m.facebook.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    }
  }

  updateStatus(
    'waiting_login',
    `Đã mở trình duyệt Chrome thành công. Vui lòng đăng nhập tài khoản Facebook trên cửa sổ màn hình (kèm 2FA nếu có).`
  );

  console.log('\n----------------------------------------------------------------');
  console.log('HƯỚNG DẪN TRÊN CỬA SỔ TRÌNH DUYỆT VỪA MỞ:');
  console.log('1. Nhập tài khoản và mật khẩu Facebook của bạn.');
  console.log('2. Nhập mã xác thực 2 bước (2FA) nếu có.');
  console.log('3. Hệ thống sẽ TỰ ĐỘNG nhận diện khi bạn đăng nhập thành công!');
  console.log('   (Không cần phải nhập lệnh nào khác, cửa sổ sẽ tự lưu và đóng)');
  console.log('----------------------------------------------------------------\n');

  let isCompleted = false;

  // Handle browser closing manually by user
  browser.on('disconnected', () => {
    if (!isCompleted) {
      console.log('\n[Thông báo] Cửa sổ trình duyệt đã bị đóng trước khi hoàn tất đăng nhập.');
      updateStatus('closed', 'Cửa sổ trình duyệt đã đóng trước khi hoàn tất đăng nhập.');
      cleanupPid();
      process.exit(0);
    }
  });

  // Optional manual Enter fallback if run interactively in terminal
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Nhấn [ENTER] nếu bạn muốn hoàn tất thủ công ngay lập tức: ', () => {
      rl.close();
    });
  }

  // Auto-detect login loop (poll cookies every 1200ms)
  const maxTimeoutMs = 15 * 60 * 1000; // 15 minutes timeout
  const startTime = Date.now();

  while (!isCompleted) {
    if (Date.now() - startTime > maxTimeoutMs) {
      console.error('\n[Hết thời gian] Quá 15 phút không hoàn tất đăng nhập.');
      updateStatus('error', 'Hết thời gian chờ đăng nhập (15 phút).');
      break;
    }

    try {
      const cookies = await context.cookies(['https://www.facebook.com', 'https://m.facebook.com']);
      const cUser = cookies.find((c) => c.name === 'c_user');
      const xs = cookies.find((c) => c.name === 'xs');

      if (cUser && cUser.value && xs && xs.value) {
        console.log(`\n✓ Phát hiện phiên đăng nhập Facebook hợp lệ! UID: ${cUser.value}`);
        isCompleted = true;

        // Give Facebook 2 seconds to establish full session state
        await new Promise((r) => setTimeout(r, 2000));

        // Display in-page success overlay
        try {
          await page.evaluate(
            ({ uid, pid }) => {
              const el = document.createElement('div');
              el.id = 'mipa-login-banner';
              el.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                background: linear-gradient(135deg, #059669, #10b981);
                color: #ffffff; padding: 18px 32px; border-radius: 16px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 15px; font-weight: 700; text-align: center;
                box-shadow: 0 20px 40px rgba(0,0,0,0.4); z-index: 2147483647;
                border: 2px solid rgba(255,255,255,0.3); pointer-events: none;
              `;
              el.innerHTML = `
                <div style="font-size: 18px; margin-bottom: 4px;">✓ ĐÃ ĐĂNG NHẬP THÀNH CÔNG CHO [${pid}]!</div>
                <div style="font-size: 13px; font-weight: 400; opacity: 0.9;">UID: ${uid} • Hệ thống đang lưu phiên và sẽ đóng cửa sổ trong giây lát...</div>
              `;
              document.body.appendChild(el);
            },
            { uid: cUser.value, pid: targetProfileId }
          );
        } catch {}

        console.log(`[3] Đang trích xuất và mã hóa phiên đăng nhập cho [${targetProfileId}]...`);
        const state = await context.storageState();
        const stateJson = JSON.stringify(state);

        const result = authManager.saveProfileSession(targetProfileId, stateJson);
        authManager.saveSession(stateJson); // Save as main fallback too

        if (!result.success) {
          console.error(`\n[LỖI] Đăng nhập chưa hoàn tất: ${result.error}`);
          updateStatus('error', `Lỗi lưu phiên: ${result.error}`);
        } else {
          // Extract real Facebook user name
          let realName = '';
          try {
            const html = await page.content();
            const matchName = html.match(/"NAME":"([^"]+)"/);
            if (matchName && matchName[1]) {
              realName = matchName[1].trim();
            } else {
              const matchShort = html.match(/"short_name":"([^"]+)"/);
              if (matchShort && matchShort[1]) realName = matchShort[1].trim();
            }
          } catch {}

          if (!realName) {
            try {
              const pageTitle = await page.title();
              if (pageTitle && !pageTitle.toLowerCase().startsWith('facebook')) {
                realName = pageTitle.replace('| Facebook', '').replace('- Facebook', '').trim();
              }
            } catch {}
          }

          const profileDisplayName = realName || `Facebook User (${result.userId})`;

          try {
            const { updateProfile } = await import('../src/lib/profiles');
            updateProfile(targetProfileId, {
              name: profileDisplayName,
              hasSession: true,
              fbUserId: result.userId,
              status: 'online',
              lastAction: `Đã đăng nhập tài khoản thật: ${profileDisplayName} (${result.userId}) lúc ${new Date().toLocaleTimeString('vi-VN')}`,
            });
          } catch (e: any) {
            console.error('[Profiles] Lỗi cập nhật hồ sơ thiết bị:', e);
          }

          console.log('\n================================================================');
          console.log(`✓ ĐÃ ĐĂNG NHẬP THÀNH CÔNG CHO [${targetProfileId}] - ${profileDisplayName}!`);
          console.log('================================================================');
          console.log(`- Tài khoản Facebook UID: ${result.userId}`);
          console.log('- Phương thức mã hóa: AES-256-GCM (bảo vệ an toàn tuyệt đối)');
          console.log('\nThiết bị đã sẵn sàng hoạt động trong hệ thống!');

          updateStatus(
            'success',
            `Đã đăng nhập và mã hóa thành công cho thiết bị [${targetProfileId}] (UID: ${result.userId})`,
            result.userId
          );

          // Wait 3 seconds before closing so user sees confirmation
          await new Promise((r) => setTimeout(r, 3000));
        }

        break;
      }
    } catch {
      // Page might be navigating, ignore and retry next cycle
    }

    await new Promise((r) => setTimeout(r, 1200));
  }

  try {
    await browser.close();
  } catch {}

  cleanupPid();
}

loginFacebook().catch((err) => {
  console.error('[LỖI]', err);
  updateStatus('error', err.message || 'Lỗi không xác định khi đăng nhập');
  cleanupPid();
  process.exit(1);
});
