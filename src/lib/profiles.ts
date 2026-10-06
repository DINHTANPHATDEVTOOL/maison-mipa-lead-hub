import fs from 'fs';
import path from 'path';

export interface FacebookProfile {
  id: string; // e.g. "dev-01", "dev-02"
  slot: number; // 1, 2, 3...
  name: string;
  type: 'personal' | 'page';
  pageId?: string;
  pageName?: string;
  fbUserId?: string;
  status: 'online' | 'busy' | 'idle' | 'offline' | 'error';
  todayComments: number;
  maxDailyComments: number;
  lastAction?: string;
  batteryLevel: number; // Mô phỏng % pin như trên màn hình điện thoại trong ảnh
  storageStatePath?: string;
  hasSession: boolean;
  notes?: string;
}

const PROFILES_DIR = path.join(process.cwd(), 'data', 'auth');
const PROFILES_FILE = path.join(PROFILES_DIR, 'profiles.json');

const DEFAULT_PROFILES: FacebookProfile[] = [
  {
    id: 'dev-01',
    slot: 1,
    name: 'Nick Cá Nhân 01 (Minh Tuấn)',
    type: 'personal',
    fbUserId: '100083281234567',
    status: 'online',
    todayComments: 12,
    maxDailyComments: 45,
    lastAction: 'Đang theo dõi nhóm Hội Tìm Thợ',
    batteryLevel: 98,
    hasSession: true,
  },
  {
    id: 'dev-02',
    slot: 2,
    name: 'Maison MIPA Fanpage Official',
    type: 'page',
    pageId: '1000987654321',
    pageName: 'Maison MIPA Photography',
    fbUserId: '1000987654321',
    status: 'online',
    todayComments: 24,
    maxDailyComments: 100,
    lastAction: 'Đã bình luận bài viết lúc 16:15',
    batteryLevel: 100,
    hasSession: true,
  },
  {
    id: 'dev-03',
    slot: 3,
    name: 'Nick Cá Nhân 02 (Lan Anh CSKH)',
    type: 'personal',
    fbUserId: '1000765432198',
    status: 'online',
    todayComments: 9,
    maxDailyComments: 40,
    lastAction: 'Sẵn sàng nhận việc',
    batteryLevel: 95,
    hasSession: true,
  },
  {
    id: 'dev-04',
    slot: 4,
    name: 'Nick Cá Nhân 03 (Thợ Ảnh Sài Gòn)',
    type: 'personal',
    fbUserId: '1000654321987',
    status: 'busy',
    todayComments: 18,
    maxDailyComments: 50,
    lastAction: 'Đang mở bài viết Facebook...',
    batteryLevel: 88,
    hasSession: true,
  },
  {
    id: 'dev-05',
    slot: 5,
    name: 'Nick Cá Nhân 04 (Maison Studio)',
    type: 'personal',
    fbUserId: '1000543219876',
    status: 'idle',
    todayComments: 6,
    maxDailyComments: 35,
    lastAction: 'Tạm nghỉ để giãn khoảng cách cmt',
    batteryLevel: 92,
    hasSession: true,
  },
  {
    id: 'dev-06',
    slot: 6,
    name: 'Maison MIPA Studio - Chi Nhánh Q1',
    type: 'page',
    pageId: '1000432198765',
    pageName: 'Maison MIPA Studio Q1',
    fbUserId: '1000432198765',
    status: 'online',
    todayComments: 15,
    maxDailyComments: 80,
    lastAction: 'Sẵn sàng nhận việc',
    batteryLevel: 97,
    hasSession: true,
  },
  {
    id: 'dev-07',
    slot: 7,
    name: 'Nick Cá Nhân 05 (Hoàng Nam Media)',
    type: 'personal',
    fbUserId: '1000321987654',
    status: 'online',
    todayComments: 4,
    maxDailyComments: 30,
    lastAction: 'Đang theo dõi nhóm Chụp Ảnh Cưới',
    batteryLevel: 85,
    hasSession: true,
  },
  {
    id: 'dev-08',
    slot: 8,
    name: 'Nick Cá Nhân 06 (Khánh Linh Model)',
    type: 'personal',
    fbUserId: '1000219876543',
    status: 'online',
    todayComments: 8,
    maxDailyComments: 40,
    lastAction: 'Sẵn sàng nhận việc',
    batteryLevel: 91,
    hasSession: true,
  },
];

export function getAllProfiles(): FacebookProfile[] {
  try {
    if (!fs.existsSync(PROFILES_DIR)) {
      fs.mkdirSync(PROFILES_DIR, { recursive: true });
    }
    if (fs.existsSync(PROFILES_FILE)) {
      const data = fs.readFileSync(PROFILES_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  // Write default profiles if none exist
  saveAllProfiles(DEFAULT_PROFILES);
  return DEFAULT_PROFILES;
}

export function saveAllProfiles(profiles: FacebookProfile[]): void {
  try {
    if (!fs.existsSync(PROFILES_DIR)) {
      fs.mkdirSync(PROFILES_DIR, { recursive: true });
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving profiles:', e);
  }
}

export function updateProfile(id: string, updates: Partial<FacebookProfile>): FacebookProfile | null {
  const profiles = getAllProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  profiles[idx] = { ...profiles[idx], ...updates };
  saveAllProfiles(profiles);
  return profiles[idx];
}

export function addProfile(profile: Partial<FacebookProfile> & { name: string; type: 'personal' | 'page' }): FacebookProfile {
  const profiles = getAllProfiles();
  const slot = profiles.length + 1;
  const newProfile: FacebookProfile = {
    id: `dev-${String(slot).padStart(2, '0')}`,
    slot,
    name: profile.name,
    type: profile.type,
    fbUserId: profile.fbUserId,
    pageId: profile.pageId,
    pageName: profile.pageName,
    todayComments: profile.todayComments || 0,
    maxDailyComments: profile.maxDailyComments || 40,
    batteryLevel: profile.batteryLevel || 100,
    hasSession: profile.hasSession || false,
    status: profile.status || 'online',
    notes: profile.notes,
  };
  profiles.push(newProfile);
  saveAllProfiles(profiles);
  return newProfile;
}

export function deleteProfile(id: string): boolean {
  const profiles = getAllProfiles();
  const filtered = profiles.filter((p) => p.id !== id);
  if (filtered.length === profiles.length) return false;
  saveAllProfiles(filtered);
  return true;
}
