"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Bookmark, CheckCircle2, Sparkles, UserRound } from "lucide-react";

// Phone tab bar for signed-in users. JobPilot sits in the middle, raised, with a spinning
// gradient ring so it reads as the "do the work for me" button.
const LEFT = [
  { href: "/jobs", label: "Jobs", Icon: Briefcase },
  { href: "/bookmarks", label: "Saved", Icon: Bookmark },
];
const RIGHT = [
  { href: "/applied", label: "Applied", Icon: CheckCircle2 },
  { href: "/profile", label: "Profile", Icon: UserRound },
];

export default function BottomTabs() {
  const pathname = usePathname();
  const isActive = (href) => pathname === href || pathname.startsWith(`${href}/`);
  const pilotActive = isActive("/jobpilot") || isActive("/drafts");

  const Tab = ({ href, label, Icon }) => {
    const active = isActive(href);
    return (
      <Link href={href} className={`flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] font-medium transition-colors ${active ? "text-purple-300" : "text-zinc-400"}`}>
        <span className={`flex h-8 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-purple-500/20" : ""}`}>
          <Icon size={20} strokeWidth={active ? 2.3 : 1.8} />
        </span>
        {label}
      </Link>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-md items-end px-2">
        {LEFT.map((t) => (
          <Tab key={t.href} {...t} />
        ))}

        <Link href="/jobpilot" aria-label="JobPilot" className="flex flex-1 flex-col items-center pb-1.5">
          <span className="relative -mt-5 flex h-14 w-14 items-center justify-center">
            <span className="jp-ring absolute inset-0 rounded-full" />
            <span className={`relative flex h-[50px] w-[50px] items-center justify-center rounded-full bg-gradient-to-br from-purple-600 via-fuchsia-600 to-indigo-600 text-white shadow-lg shadow-purple-900/60 transition-transform active:scale-95 ${pilotActive ? "ring-2 ring-white/70" : ""}`}>
              <Sparkles size={22} className="jp-twinkle" />
            </span>
          </span>
          <span className={`mt-1 text-[11px] font-semibold ${pilotActive ? "text-fuchsia-300" : "bg-gradient-to-r from-purple-300 to-fuchsia-300 bg-clip-text text-transparent"}`}>JobPilot</span>
        </Link>

        {RIGHT.map((t) => (
          <Tab key={t.href} {...t} />
        ))}
      </div>
    </nav>
  );
}
