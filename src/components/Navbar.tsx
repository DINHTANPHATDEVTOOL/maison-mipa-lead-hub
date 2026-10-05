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
  ShieldCheck, 
  Radio, 
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { UserRole } from '@/types';

export default function Navbar() {
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole>('admin');
  const [workerAlive, setWorkerAlive] = useState(true);
  const [operatingMode, setOperatingMode] = useState<'manual_review' | 'auto_dispatch'>('manual_review');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchWorkerStatus();
    const interval = setInterval(fetchWorkerStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchWorkerStatus = async () => {
    try {
      const res = await fetch('/api/worker/heartbeat');
      const data = await res.json();
      if (data.success) {
        setWorkerAlive(data.data.is_alive);
        setOperatingMode(data.data.operating_mode);
      }
    } catch {
      setWorkerAlive(false);
    }
  };

  const navItems = [
    { href: '/', label: 'Tổng Quan', icon: LayoutDashboard, roles: ['admin', 'marketing', 'cskh'] },
    { href: '/groups', label: 'Quét Nhóm FB', icon: Radio, roles: ['admin', 'marketing'] },
    { href: '/feed', label: 'Hàng Chờ Bài Viết', icon: MessageSquareCheck, roles: ['admin', 'marketing'] },
    { href: '/crm', label: 'Pipeline CSKH', icon: Users, roles: ['admin', 'cskh', 'marketing'] },
    { href: '/services-templates', label: 'Dịch Vụ & Mẫu', icon: Layers, roles: ['admin', 'marketing'] },
    { href: '/settings', label: 'Kiểm Chứng & Cài Đặt', icon: Settings, roles: ['admin'] },
  ];

  const filteredNav = navItems.filter(item => item.roles.includes(role));

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-white/10 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 via-brand-500 to-amber-300 flex items-center justify-center shadow-md shadow-brand-500/20 text-white font-bold">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-amber-200 via-amber-400 to-brand-400 bg-clip-text text-transparent">
                  MAISON MIPA
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 font-medium">
                  Lead Hub
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">Giám sát nhóm & Quản trị chuyển đổi</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            {filteredNav.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-brand-500/15 text-amber-300 border border-brand-500/30 shadow-inner'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-zinc-400'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Controls: Worker Status + Role Switcher */}
          <div className="flex items-center space-x-3">
            
            {/* Live Worker Status Indicator */}
            <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-lg glass-card text-xs">
              <div className="relative flex items-center justify-center">
                <span className={`w-2.5 h-2.5 rounded-full ${workerAlive ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                {workerAlive && (
                  <span className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping opacity-75" />
                )}
              </div>
              <span className="text-zinc-300 font-medium">
                {workerAlive ? 'Bộ Chạy Nền: Đang Chạy' : 'Bộ Chạy Nền: Tạm Dừng'}
              </span>
              <span className="text-zinc-500">|</span>
              <span className={`text-[11px] font-semibold ${operatingMode === 'auto_dispatch' ? 'text-cyan-400' : 'text-amber-400'}`}>
                {operatingMode === 'auto_dispatch' ? 'Tự Động' : 'Duyệt Tay'}
              </span>
            </div>

            {/* Role Switcher */}
            <div className="flex items-center bg-zinc-900 border border-white/10 rounded-lg p-1 text-xs">
              <span className="text-zinc-500 px-2 font-medium">Vai trò:</span>
              {(['admin', 'marketing', 'cskh'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`px-2.5 py-1 rounded text-xs capitalize font-medium transition-colors ${
                    role === r
                      ? 'bg-brand-500 text-white shadow-sm'
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
