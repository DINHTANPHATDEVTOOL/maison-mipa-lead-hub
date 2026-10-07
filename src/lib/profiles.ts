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
    name: 'Thiết Bị 01',
    type: 'personal',
    status: 'offline',
    todayComments: 0,
    maxDailyComments: 45,
    lastAction: 'Chưa có phiên đăng nhập',
    batteryLevel: 100,
    hasSession: false,
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

export function cleanMockProfiles(): FacebookProfile[] {
  const profiles = getAllProfiles();
  const authDir = path.join(process.cwd(), 'data', 'auth', 'profiles');

  // Keep profiles that have a real session file or have an active session
  const real = profiles.filter((p) => {
    const sessionFile = path.join(authDir, `${p.id}.enc`);
    return fs.existsSync(sessionFile) || (p.id === 'dev-01' && p.hasSession);
  });

  const fallback: FacebookProfile[] = [
    {
      id: 'dev-01',
      slot: 1,
      name: 'Thiết Bị 01',
      type: 'personal',
      status: 'offline',
      todayComments: 0,
      maxDailyComments: 45,
      lastAction: 'Chờ đăng nhập Facebook',
      batteryLevel: 100,
      hasSession: false,
    },
  ];

  const finalProfiles: FacebookProfile[] = real.length > 0 ? real : fallback;

  finalProfiles.forEach((p, idx) => {
    p.slot = idx + 1;
  });

  saveAllProfiles(finalProfiles);
  return finalProfiles;
}
