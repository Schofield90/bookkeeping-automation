import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Smart Bookkeeping",
  description: "AI-powered bookkeeping integrated with Xero",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <div style={{ paddingTop: '70px' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
