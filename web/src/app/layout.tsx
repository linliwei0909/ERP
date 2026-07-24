import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ragic 本地端系統",
  description: "Ragic 本地端系統重建",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
