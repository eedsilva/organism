import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Organism — Mission Control",
  description: "Autonomous economic agent executive dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-black text-white selection:bg-white selection:text-black`}>
        <div className="flex bg-black min-h-screen">
          <Sidebar />
          {children}
        </div>
      </body>
    </html>
  );
}
