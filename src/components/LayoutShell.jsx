"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import Footer from "./Footer";

export default function LayoutShell({ children }) {
  const pathname = usePathname();
  const hideChrome = pathname === "/login";

  if (hideChrome) {
    return <div className="min-h-screen bg-zinc-950">{children}</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
