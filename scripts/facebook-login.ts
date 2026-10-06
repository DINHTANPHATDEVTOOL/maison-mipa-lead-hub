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

  console.log('\n[3] Đang trích xuất và mã hóa phiên đăng nhập an toàn...');
  const state = await context.storageState();
  const stateJson = JSON.stringify(state);

  const result = authManager.saveSession(stateJson);
  if (!result.success) {
    console.error(`\n[LỖI] Đăng nhập chưa hoàn tất: ${result.error}`);
    console.error('Vui lòng kiểm tra xem bạn đã đăng nhập hẳn vào Facebook chưa.');
  } else {
    const summary = authManager.getSessionSummary();
    console.log('\n================================================================');
    console.log('✓ ĐĂNG NHẬP THÀNH CÔNG VÀ ĐÃ MÃ HÓA PHIÊN AN TOÀN!');
    console.log('================================================================');
    console.log(`- Tài khoản Facebook UID: ${summary.userId}`);
    console.log(`- Trạng thái: ${summary.reason}`);
    console.log('- Phương thức mã hóa: AES-256-GCM (bảo vệ an toàn tuyệt đối)');
    console.log('\nBạn có thể khởi động Worker để bắt đầu quét nhóm và gửi bình luận:');
    console.log('  npm run worker\n');
  }

  await browser.close();
}

loginFacebook().catch((err) => {
  console.error('[LỖI]', err);
  process.exit(1);
});
