import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Maison MIPA - Trung Tâm Vận Hành Khách Hàng & Giám Sát Nhóm',
  description: 'Hệ thống vận hành tiếp cận nhóm Facebook, phân loại nhu cầu và quản lý đường ống chăm sóc khách hàng Maison MIPA Studio.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="dark">
      <body className="bg-[#090b10] text-zinc-100 min-h-screen flex flex-col antialiased selection:bg-amber-600 selection:text-white">
        <Navbar />
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <footer className="border-t border-zinc-900 bg-[#07090d] py-3.5 text-center text-xs text-zinc-500">
          Maison MIPA Lead Hub © 2026 — Hệ Thống Giám Sát Vận Hành & CRM Tiếp Cận Khách Hàng (Tập Trung & Chống Trùng Lặp)
        </footer>
      </body>
    </html>
  );
}
