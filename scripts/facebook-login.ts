import { chromium } from 'playwright';
import { authManager } from '../src/worker/auth';
import readline from 'readline';

async function loginFacebook() {
  console.log('================================================================');
  console.log('       MAISON MIPA LEAD HUB - ĐĂNG NHẬP FACEBOOK THỰC TẾ');
  console.log('================================================================');
  console.log('\n[1] Đang mở trình duyệt Chrome có giao diện...');

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'vi-VN',
  });

  const page = await context.newPage();
  console.log('[2] Đang chuyển đến trang Facebook...');
  await page.goto('https://www.facebook.com');

  console.log('\n----------------------------------------------------------------');
  console.log('HƯỚNG DẪN TRÊN CỬA SỔ TRÌNH DUYỆT VỪA MỞ:');
  console.log('1. Nhập tài khoản/mật khẩu Facebook của bạn.');
  console.log('2. Nhập mã xác thực 2 bước (2FA) nếu có.');
  console.log('3. Khi đã vào được trang chủ (bảng tin Facebook), quay lại đây.');
  console.log('----------------------------------------------------------------\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise<void>((resolve) => {
    rl.question('Nhấn [ENTER] tại terminal này sau khi bạn đã đăng nhập thành công: ', () => {
      rl.close();
      resolve();
    });
  });

  const targetProfileId = process.argv[2] || 'dev-01';
  console.log(`\n[3] Đang trích xuất và mã hóa phiên đăng nhập cho [${targetProfileId}]...`);
  const state = await context.storageState();
  const stateJson = JSON.stringify(state);

  const result = authManager.saveProfileSession(targetProfileId, stateJson);
  authManager.saveSession(stateJson); // Save as main fallback too

  if (!result.success) {
    console.error(`\n[LỖI] Đăng nhập chưa hoàn tất: ${result.error}`);
    console.error('Vui lòng kiểm tra xem bạn đã đăng nhập hẳn vào Facebook chưa.');
  } else {
    try {
      const { updateProfile } = await import('../src/lib/profiles');
      updateProfile(targetProfileId, {
        hasSession: true,
        fbUserId: result.userId,
        status: 'online',
        lastAction: `Đã đăng nhập thành công lúc ${new Date().toLocaleTimeString('vi-VN')}`,
      });
    } catch {}

    console.log('\n================================================================');
    console.log(`✓ ĐÃ ĐĂNG NHẬP THÀNH CÔNG CHO [${targetProfileId}]!`);
    console.log('================================================================');
    console.log(`- Tài khoản Facebook UID: ${result.userId}`);
    console.log('- Phương thức mã hóa: AES-256-GCM (bảo vệ an toàn tuyệt đối)');
    console.log('\nThiết bị đã sẵn sàng hoạt động trong hệ thống!');
  }

  await browser.close();
}

loginFacebook().catch((err) => {
  console.error('[LỖI]', err);
  process.exit(1);
});
