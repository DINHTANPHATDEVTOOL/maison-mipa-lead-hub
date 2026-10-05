'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Camera, 
  LayoutDashboard, 
  Layers, 
  MessageSquareCheck, 
  Users, 
  Settings, 
  Radio,
  CheckCircle2,
  AlertCircle,
  Lock,
  X,
  LogIn,
  LogOut,
  UserCheck
} from 'lucide-react';
import { UserRole } from '@/types';

export default function Navbar() {
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [workerAlive, setWorkerAlive] = useState(false);
  const [operatingMode, setOperatingMode] = useState<'manual_review' | 'auto_dispatch'>('manual_review');
  const [staleSeconds, setStaleSeconds] = useState<number>(0);

  // Login Modal State
  const [loginModalRole, setLoginModalRole] = useState<UserRole | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Check active session on load
    checkActiveSession();
    fetchWorkerStatus();
    const interval = setInterval(fetchWorkerStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const checkActiveSession = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('mipa_token') : null;
      if (!token) {
        setIsAuthenticated(false);
        setRole(null);
        setUserName('');
        return;
      }

      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      const res = await fetch('/api/auth/me', { headers });
      const json = await res.json();
      if (json.success && json.user) {
        setIsAuthenticated(true);
        setRole(json.user.role);
        setUserName(json.user.name);
        localStorage.setItem('mipa_token', json.user.token);
        localStorage.setItem('mipa_role', json.user.role);
      } else {
        // Token invalid or expired - strictly clear unauthenticated state
        setIsAuthenticated(false);
        setRole(null);
        setUserName('');
        localStorage.removeItem('mipa_token');
        localStorage.removeItem('mipa_role');
      }
    } catch (e) {
      console.error('Session check error:', e);
      setIsAuthenticated(false);
      setRole(null);
      setUserName('');
    }
  };

  const handleRoleButtonClick = (targetRole: UserRole) => {
    // If already authenticated with target role, do nothing
    if (isAuthenticated && targetRole === role) return;

    // If unauthenticated or switching accounts, always prompt login modal!
    setLoginModalRole(targetRole);
    setLoginPassword('');
    setLoginError(null);
  };

  const handleLogout = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('mipa_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/auth/logout', { method: 'POST', headers });
    } catch (e) {
      console.error('Logout API call error:', e);
    } finally {
      localStorage.removeItem('mipa_token');
      localStorage.removeItem('mipa_role');
      if (typeof document !== 'undefined') {
        document.cookie = 'mipa_auth_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
      setIsAuthenticated(false);
      setRole(null);
      setUserName('');
      window.location.reload();
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginModalRole) return;
    setIsSubmitting(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: loginModalRole, password: loginPassword }),
      });
      const json = await res.json();

      if (json.success && json.data) {
        setIsAuthenticated(true);
        setRole(json.data.role);
        setUserName(json.data.name);
        localStorage.setItem('mipa_token', json.data.token);
        localStorage.setItem('mipa_role', json.data.role);
        setLoginModalRole(null);
        setLoginPassword('');
        window.location.reload();
      } else {
        setLoginError(json.error || 'Mật khẩu không chính xác.');
      }
    } catch (err: any) {
      setLoginError('Lỗi kết nối máy chủ: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchWorkerStatus = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('mipa_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/worker/heartbeat', { headers });
      const data = await res.json();
      if (data.success) {
        setWorkerAlive(Boolean(data.data.is_alive));
        setOperatingMode(data.data.operating_mode || 'manual_review');
        setStaleSeconds(data.data.stale_seconds || 0);
      } else {
        setWorkerAlive(false);
      }
    } catch {
      setWorkerAlive(false);
    }
  };

  const navItems = [
    { href: '/', label: 'Tổng Quan', icon: LayoutDashboard, roles: ['admin', 'marketing', 'cskh'] },
    { href: '/groups', label: 'Quét Nhóm FB', icon: Radio, roles: ['admin', 'marketing'] },
    { href: '/feed', label: 'Hàng Chờ Tiếp Cận', icon: MessageSquareCheck, roles: ['admin', 'marketing'] },
    { href: '/crm', label: 'Pipeline CSKH', icon: Users, roles: ['admin', 'cskh', 'marketing'] },
    { href: '/services-templates', label: 'Bảng Dịch Vụ & Mẫu', icon: Layers, roles: ['admin', 'marketing'] },
    { href: '/settings', label: 'Cài Đặt & Kiểm Tra', icon: Settings, roles: ['admin'] },
  ];

  const filteredNav = role ? navItems.filter(item => item.roles.includes(role)) : navItems;

  const roleLabels: Record<UserRole, string> = {
    admin: 'Quản Trị Viên (Admin)',
    marketing: 'Nhân Viên Marketing',
    cskh: 'Nhân Viên CSKH & Chốt Lịch',
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#0d1017]/95 backdrop-blur-md border-b border-zinc-800 shadow-md">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo & Brand */}
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="w-9 h-9 rounded-lg bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:bg-amber-600 group-hover:text-white transition-all">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-base font-bold tracking-tight text-white">
                    MAISON MIPA
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400 font-semibold border border-zinc-700">
                    Lead Hub
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">Hệ thống giám sát nhóm & tiếp cận khách hàng</p>
              </div>
            </Link>

            {/* Navigation Links */}
            <nav className="hidden md:flex items-center space-x-1">
              {filteredNav.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-zinc-400'}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right Controls: Worker Status + Staff Account Switcher */}
            <div className="flex items-center space-x-3">
              
              {/* Live Worker Status */}
              <div 
                title={workerAlive ? `Tiến trình nền đang gửi nhịp tim (${staleSeconds}s trước)` : 'Tiến trình nền đang tắt hoặc mất kết nối'}
                className="hidden lg:flex items-center space-x-2 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs"
              >
                <span className={`w-2 h-2 rounded-full ${workerAlive ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                <span className="text-zinc-300 text-[11px] font-medium">
                  {workerAlive ? 'Tiến trình: Đang chạy' : 'Tiến trình: Chưa bật'}
                </span>
                <span className="text-zinc-600">|</span>
                <span className={`text-[11px] font-medium ${operatingMode === 'auto_dispatch' ? 'text-cyan-400' : 'text-amber-400'}`}>
                  {operatingMode === 'auto_dispatch' ? 'Tự động' : 'Duyệt tay'}
                </span>
              </div>

              {/* Staff Accounts Selector */}
              {isAuthenticated && role ? (
                <div className="flex items-center space-x-2">
                  <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-1 text-xs">
                    <span className="text-zinc-400 px-2 text-[11px] font-medium hidden sm:inline">{userName || 'Tài khoản'}:</span>
                    {(['admin', 'marketing', 'cskh'] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => handleRoleButtonClick(r)}
                        className={`px-2.5 py-1 rounded text-xs capitalize font-medium transition-colors ${
                          role === r
                            ? 'bg-amber-600 text-white shadow-sm font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {r === 'admin' ? 'Admin' : r === 'marketing' ? 'Marketing' : 'CSKH'}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleLogout}
                    title="Đăng xuất khỏi hệ thống"
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-500/30 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <div className="flex items-center bg-zinc-900 border border-amber-500/30 rounded-lg p-1 text-xs">
                    <span className="text-amber-400 px-2 text-[11px] font-medium flex items-center space-x-1">
                      <Lock className="w-3 h-3 text-amber-400" />
                      <span className="hidden sm:inline">Đăng nhập:</span>
                    </span>
                    {(['admin', 'marketing', 'cskh'] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => handleRoleButtonClick(r)}
                        className="px-2.5 py-1 rounded text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                      >
                        {r === 'admin' ? 'Admin' : r === 'marketing' ? 'Marketing' : 'CSKH'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>
      </header>

      {/* Login Password Prompt Modal */}
      {loginModalRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12151e] border border-zinc-800 rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2 text-white font-bold text-sm">
                <Lock className="w-4 h-4 text-amber-500" />
                <span>{isAuthenticated ? 'Chuyển Đổi Tài Khoản' : 'Đăng Nhập Tài Khoản'}</span>
              </div>
              <button 
                onClick={() => setLoginModalRole(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-3.5 text-xs">
              <div>
                <span className="text-zinc-400 block mb-1">
                  {isAuthenticated ? 'Chuyển sang vai trò:' : 'Đăng nhập vào vai trò:'}
                </span>
                <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 text-amber-300 font-semibold text-xs">
                  {roleLabels[loginModalRole]}
                </div>
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  Nhập Mật Khẩu
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="Nhập mật khẩu tài khoản..."
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              {loginError && (
                <div className="p-2.5 rounded bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setLoginModalRole(null)}
                  className="px-3.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Đang kiểm tra...' : 'Đăng Nhập'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
