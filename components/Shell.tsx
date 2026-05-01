"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  Trash2,
  Search,
  Upload,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import RestaurantSwitcher from "./RestaurantSwitcher";
import AddRestaurantButton from "./AddRestaurantButton";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/items", label: "Items", icon: Package },
  { href: "/prices", label: "Prices", icon: TrendingUp },
  { href: "/wastage", label: "Wastage", icon: Trash2 },
  { href: "/search", label: "Search", icon: Search },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, signOut, loading } = useAuth();

  // Login route renders standalone (no chrome)
  if (pathname === "/login") return <>{children}</>;

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Loading…
      </div>
    );
  if (!session) return null;

  const initials = session.user.email?.[0].toUpperCase() ?? "?";
  const activePage = NAV.find((n) =>
    n.exact ? pathname === n.href : pathname.startsWith(n.href)
  );

  return (
    <div className="min-h-screen flex">
      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200/70 flex flex-col fixed inset-y-0 left-0 z-10">
        {/* Brand */}
        <div className="px-6 py-5">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-semibold text-slate-900"
          >
            <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-bold shadow-sm">
              M
            </span>
            <span className="tracking-tight">Mise</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pt-2 space-y-0.5">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </div>
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  active
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon
                  size={16}
                  strokeWidth={2}
                  className={active ? "text-slate-900" : "text-slate-400"}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User card */}
        <div className="px-3 py-3 border-t border-slate-200/70">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-xs font-semibold text-white shadow-sm">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-900 truncate">
                {session.user.email}
              </div>
              <div className="text-[11px] text-slate-400">Signed in</div>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 p-1.5 rounded-md transition"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main column (offset for fixed sidebar) ────────────────── */}
      <div className="flex-1 ml-60 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="h-16 bg-white/80 backdrop-blur border-b border-slate-200/70 flex items-center px-8 sticky top-0 z-[5]">
          <h1 className="text-sm font-medium text-slate-700">
            {activePage?.label ?? "Dashboard"}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <RestaurantSwitcher />
            <AddRestaurantButton />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-8 py-8 max-w-7xl w-full">{children}</main>
      </div>
    </div>
  );
}
