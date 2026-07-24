import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SidebarNav } from "@/components/sidebar-nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "奇麗 ERP",
  description: "個人進銷存與批號庫存管理系統",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body suppressHydrationWarning>
        <div className="app-shell min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
          <aside className="app-sidebar border-b px-4 py-5 text-white lg:fixed lg:inset-y-0 lg:w-[264px] lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-3 px-2">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-400 text-base font-black text-slate-950 shadow-lg shadow-teal-950/30">
                C
              </div>
              <div>
                <p className="text-sm font-bold tracking-wide text-white">奇麗 ERP</p>
                <p className="mt-0.5 text-[11px] tracking-wide text-slate-400">企業營運管理系統</p>
              </div>
            </div>

            <SidebarNav />

            <div className="mt-8 hidden border-t border-slate-800/80 px-2 pt-5 text-xs leading-5 text-slate-500 lg:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">系統狀態</p>
              <p className="mt-2 flex items-center gap-2 text-slate-400">
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgb(52_211_153_/_0.12)]" /> 資料庫連線正常
              </p>
            </div>
          </aside>

          <main className="min-w-0 px-4 py-6 sm:px-7 lg:col-start-2 lg:px-9 lg:py-9 xl:px-12">
            <div className="mx-auto max-w-[1480px]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
