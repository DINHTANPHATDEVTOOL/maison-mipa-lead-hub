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
  AlertCircle
} from 'lucide-react';
import { UserRole } from '@/types';

export default function Navbar() {
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole>('admin');
  const [userName, setUserName] = useState<string>('Đinh Tấn Phát');
  const [workerAlive, setWorkerAlive] = useState(false);
  const [operatingMode, setOperatingMode] = useState<'manual_review' | 'auto_dispatch'>('manual_review');
  const [staleSeconds, setStaleSeconds] = useState<number>(0);

  useEffect(() => {
    const savedRole = (localStorage.getItem('mipa_role') as UserRole) || 'admin';
    handleLoginAsRole(savedRole, false);

    fetchWorkerStatus();
    const interval = setInterval(fetchWorkerStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleLoginAsRole = async (targetRole: UserRole, reloadPage: boolean = true) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: targetRole, password: 'mipa@2026' }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setRole(targetRole);
        setUserName(json.data.name);
        localStorage.setItem('mipa_token', json.data.token);
        localStorage.setItem('mipa_role', targetRole);
        localStorage.setItem('mipa_username', json.data.name);

        if (reloadPage) {
          window.location.reload();
        }
      }
    } catch (e) {
      console.error('Lỗi xác thực người dùng:', e);
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

  const filteredNav = navItems.filter(item => item.roles.includes(role));

  return (
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
              title={workerAlive ? `Bộ chạy nền đang ping đều đặn (${staleSeconds}s trước)` : 'Bộ chạy nền đang tắt hoặc mất nhịp tim (>120s)'}
              className="hidden lg:flex items-center space-x-2 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs"
            >
              <span className={`w-2 h-2 rounded-full ${workerAlive ? 'bg-emerald-400' : 'bg-rose-500'}`} />
              <span className="text-zinc-300 text-[11px] font-medium">
                {workerAlive ? 'Tiến trình: Đang chạy' : 'Tiến trình: Tạm dừng'}
              </span>
              <span className="text-zinc-600">|</span>
              <span className={`text-[11px] font-medium ${operatingMode === 'auto_dispatch' ? 'text-cyan-400' : 'text-amber-400'}`}>
                {operatingMode === 'auto_dispatch' ? 'Tự động' : 'Duyệt tay'}
              </span>
            </div>

            {/* Staff Accounts Selector */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-1 text-xs">
              <span className="text-zinc-400 px-2 text-[11px] font-medium hidden sm:inline">Tài khoản:</span>
              {(['admin', 'marketing', 'cskh'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => handleLoginAsRole(r, true)}
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

          </div>

        </div>
      </div>
    </header>
  );
}
