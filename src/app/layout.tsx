import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Maison MIPA - Lead Hub & Facebook Group Outreach Engine',
  description: 'Hệ thống giám sát nhóm Facebook, nhận dạng nhu cầu chụp ảnh và chăm sóc khách hàng tập trung cho Maison MIPA Photography.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="dark">
      <body className="bg-[#0b0d13] text-zinc-100 min-h-screen flex flex-col antialiased selection:bg-brand-500 selection:text-white">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <footer className="border-t border-white/5 py-4 text-center text-xs text-zinc-500">
          Maison MIPA Lead Hub © 2026 — Hệ Thống Giám Sát Nhóm & CRM Tập Trung (Bảo mật phiên & Phòng chống trùng lặp)
        </footer>
      </body>
    </html>
  );
}
