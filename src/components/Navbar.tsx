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
  Zap
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

export default function Navbar() {
  const pathname = usePathname();
  const [workerAlive, setWorkerAlive] = useState(false);
  const [operatingMode, setOperatingMode] = useState<'manual_review' | 'auto_dispatch'>('manual_review');
  const [staleSeconds, setStaleSeconds] = useState<number>(0);

  useEffect(() => {
    fetchWorkerStatus();
    const interval = setInterval(fetchWorkerStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchWorkerStatus = async () => {
    try {
      const res = await apiFetch('/api/worker/heartbeat');
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
    { href: '/', label: 'Tổng Quan', icon: LayoutDashboard },
    { href: '/groups', label: 'Quét Nhóm FB', icon: Radio },
    { href: '/feed', label: 'Hàng Chờ Tiếp Cận', icon: MessageSquareCheck },
    { href: '/crm', label: 'Pipeline CSKH', icon: Users },
    { href: '/services-templates', label: 'Bảng Dịch Vụ & Mẫu', icon: Layers },
    { href: '/settings', label: 'Cài Đặt & Kiểm Tra', icon: Settings },
  ];

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

          {/* Navigation Links - All accessible directly */}
          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
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

          {/* Right Controls: Worker Status + Zero Friction Direct Mode Badge */}
          <div className="flex items-center space-x-3">
            
            {/* Live Worker Status */}
            <div 
              title={workerAlive ? `Tiến trình nền đang gửi nhịp tim (${staleSeconds}s trước)` : 'Tiến trình nền đang tắt hoặc mất kết nối'}
              className="hidden lg:flex items-center space-x-2 px-2.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs"
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

            {/* Direct Tool Mode Indicator (Zero Friction - Mở tool là chạy) */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Toàn Quyền Vận Hành</span>
            </div>

          </div>

        </div>
      </div>
    </header>
  );
}
